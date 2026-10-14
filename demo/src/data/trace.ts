// Type-only library imports: the dev server's trace plugin loads this file without a build.
import type { AggregateRequest, Bucket, DataProvider, RowRange } from 'granum-grid';
import { splitRange } from './ranges';
import {
  NUMBER_OPERATORS,
  TEXT_OPERATORS,
  checkPredicate,
  compare,
  yieldToEventLoop,
} from './search';

export const MAX_TRACE_BYTES = 25 * 1024 * 1024;
export const MAX_TRACE_EVENTS = 150_000;
const maxSize = `${MAX_TRACE_BYTES / 1024 / 1024} MiB`;
const maxEvents = MAX_TRACE_EVENTS.toLocaleString('en-US');
/** The accepted recording size, as "25 MiB / 150,000 events". */
export const TRACE_LIMITS = `${maxSize} / ${maxEvents} events`;
export const TRACE_TOO_LARGE = `Choose a JSON recording smaller than ${maxSize}.`;
export interface TraceRow {
  name: string;
  category: string;
  thread: string;
  time: number;
  duration: number;
  kind: 'duration' | 'instant';
}
export interface TraceRecording {
  rows: TraceRow[];
  ignored: number;
  duration: number;
  longestIndex: number;
}
/** Chrome JSON subset: complete (X) and instant (I/i) events; timestamps are microseconds. */
export function parseTrace(text: string): TraceRecording {
  if (new TextEncoder().encode(text).byteLength > MAX_TRACE_BYTES) throw new Error(TRACE_TOO_LARGE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Export a JSON trace from Chrome Performance.');
  }
  const events = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'traceEvents' in parsed
      ? parsed.traceEvents
      : null;
  if (!Array.isArray(events))
    throw new Error('Expected an event array or an object containing traceEvents.');
  if (events.length > MAX_TRACE_EVENTS)
    throw new Error(
      `This demo accepts up to ${maxEvents} source events. Export a shorter recording.`,
    );
  const rows: TraceRow[] = [];
  let ignored = 0;
  for (const event of events) {
    if (
      !event ||
      typeof event !== 'object' ||
      !['X', 'I', 'i'].includes(event.ph) ||
      typeof event.name !== 'string' ||
      typeof event.ts !== 'number' ||
      !Number.isFinite(event.ts) ||
      event.ts < 0 ||
      (event.ph === 'X' &&
        (typeof event.dur !== 'number' ||
          !Number.isFinite(event.dur) ||
          event.dur < 0 ||
          !Number.isFinite(event.ts + event.dur)))
    ) {
      ignored++;
      continue;
    }
    rows.push({
      name: event.name.slice(0, 240),
      category: typeof event.cat === 'string' ? event.cat.slice(0, 160) : 'uncategorized',
      thread: `${typeof event.pid === 'number' || typeof event.pid === 'string' ? String(event.pid).slice(0, 40) : '?'}/${typeof event.tid === 'number' || typeof event.tid === 'string' ? String(event.tid).slice(0, 40) : '?'}`,
      time: event.ts / 1000,
      duration: event.ph === 'X' ? event.dur / 1000 : 0,
      kind: event.ph === 'X' ? 'duration' : 'instant',
    });
  }
  if (!rows.length)
    throw new Error(
      'No supported events. This demo reads complete (X) and instant (I/i) Chrome trace events.',
    );
  rows.sort((a, b) => a.time - b.time);
  const origin = rows[0].time;
  let duration = 0,
    longestIndex = 0;
  rows.forEach((row, index) => {
    row.time -= origin;
    duration = Math.max(duration, row.time + row.duration);
    if (row.duration > rows[longestIndex].duration) longestIndex = index;
  });
  return { rows, ignored, duration, longestIndex };
}
export const elapsed = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(2)} ms`;
export function traceRangeLabel(recording: TraceRecording, range: RowRange) {
  const first = recording.rows[range.start];
  const last = recording.rows[Math.min(recording.rows.length - 1, range.end - 1)];
  return first && last
    ? `${elapsed(first.time)}–${elapsed(last.time)} · event start times`
    : 'Empty range';
}
export function traceBuckets(recording: TraceRecording, range: AggregateRequest): Bucket[] {
  return splitRange(range.start, range.end, range.buckets).map(({ start, end }) => {
    let min = Infinity,
      max = 0,
      sum = 0;
    for (let j = start; j < end; j++) {
      const value = recording.rows[j].duration;
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
    return {
      start,
      end,
      count: end - start,
      min,
      max,
      avg: sum / (end - start),
      accuracy: 'exact',
      label: traceRangeLabel(recording, { start, end }),
    };
  });
}
export function traceProvider(recording: TraceRecording, revision: string): DataProvider<TraceRow> {
  const { rows, longestIndex } = recording;
  return {
    id: 'performance-recording',
    revision,
    rowCount: rows.length,
    searchHelp: {
      text: true,
      placeholder: 'Text, row number, percentage, or field query…',
      examples: ['duration > 10', 'name = "Layout"'],
      dates: false,
      fields: [
        { name: 'duration', type: 'number', operators: NUMBER_OPERATORS },
        { name: 'name', type: 'text', operators: TEXT_OPERATORS },
        { name: 'thread', type: 'text', operators: TEXT_OPERATORS },
      ],
    },
    metric: {
      label: 'Event duration',
      unit: 'ms',
      kind: 'value',
      domain: [0, Math.max(1, rows[longestIndex].duration)],
    },
    async fetchRows(start, count, signal) {
      signal.throwIfAborted();
      return rows.slice(start, start + count);
    },
    async fetchOverview(buckets, signal) {
      signal.throwIfAborted();
      return traceBuckets(recording, { start: 0, end: rows.length, buckets });
    },
    async fetchAggregates(range, signal) {
      signal.throwIfAborted();
      return traceBuckets(recording, range);
    },
    async fetchMarkers(signal) {
      signal.throwIfAborted();
      return [{ id: 'longest', index: longestIndex, label: 'Longest event', kind: 'event' }];
    },
    async fetchChapters(signal) {
      signal.throwIfAborted();
      return splitRange(0, rows.length, 5).map(({ start, end }, i) => {
        return {
          id: `part-${i}`,
          start,
          end,
          label: elapsed(rows[start].time),
          breadcrumb: ['Performance recording', elapsed(rows[start].time)],
        };
      });
    },
    async search(query, context) {
      context.signal.throwIfAborted();
      if (query.kind === 'date') throw new Error('This dataset does not support date search.');
      if (query.kind === 'text' && !query.value.trim())
        throw new Error('Enter text to search for.');
      if (query.kind === 'predicate') {
        if (!['duration', 'name', 'thread'].includes(query.field))
          throw new Error('Search supports duration, name, and thread.');
        checkPredicate(query, query.field === 'duration' ? 'number' : 'text');
      }
      const matches = [];
      for (let index = 0; index < rows.length; index++) {
        if (index % 512 === 0) await yieldToEventLoop(context.signal);
        const match =
          query.kind === 'text'
            ? [rows[index].name, rows[index].thread, rows[index].category].some((value) =>
                value.toLowerCase().includes(query.value.trim().toLowerCase()),
              )
            : compare(
                rows[index][query.field as 'duration' | 'name' | 'thread'],
                query.operator,
                query.value,
              );
        if (match) {
          if (matches.length === context.limit)
            return {
              matches,
              complete: false,
              message: `Showing the first ${context.limit} matching events in this recording.`,
            };
          matches.push({
            id: `trace-${index}`,
            index,
            label: `${rows[index].name} · ${elapsed(rows[index].duration)}`,
            kind: 'search' as const,
          });
        }
      }
      return { matches, complete: true };
    },
  };
}
