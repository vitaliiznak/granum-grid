import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MAX_TRACE_EVENTS, parseTrace, traceBuckets, traceProvider } from '../src/data/trace';
const signal = () => new AbortController().signal;
const sample = () =>
  parseTrace(
    JSON.stringify({
      traceEvents: [
        { name: 'Layout', ph: 'X', ts: 5000, dur: 3000, pid: 1, tid: 2 },
        { name: 'Start', ph: 'i', ts: 1000, pid: 1, tid: 2 },
        { name: 'Paint', ph: 'X', ts: 5000, dur: 1000, pid: 1, tid: 2 },
        { name: 'Metadata', ph: 'M', ts: 0 },
      ],
    }),
  );

describe('local Chrome JSON trace adapter', () => {
  it('normalizes microseconds, sorts stably and reports omitted records', () => {
    const recording = sample();
    expect(recording.rows.map((r) => [r.name, r.time, r.duration])).toEqual([
      ['Start', 0, 0],
      ['Layout', 4, 3],
      ['Paint', 4, 1],
    ]);
    expect(recording).toMatchObject({ duration: 7, ignored: 1, longestIndex: 1 });
  });
  it('rejects unsupported input and never coerces timestamps or negative durations', () => {
    expect(() => parseTrace('{')).toThrow('valid JSON');
    expect(() => parseTrace('{}')).toThrow('traceEvents');
    expect(() =>
      parseTrace(
        JSON.stringify([
          { name: 'bad', ph: 'X', ts: '10', dur: 1 },
          { name: 'bad', ph: 'X', ts: 10, dur: -1 },
        ]),
      ),
    ).toThrow('No supported');
    expect(() => parseTrace(JSON.stringify(Array(MAX_TRACE_EVENTS + 1).fill(null)))).toThrow(
      '150,000',
    );
  });
  it('uses exact, contiguous summaries over the requested half-open range', () => {
    expect(traceBuckets(sample(), { start: 1, end: 3, buckets: 8 })).toMatchObject([
      { start: 1, end: 2, count: 1, avg: 3, min: 3, max: 3, accuracy: 'exact' },
      { start: 2, end: 3, count: 1, avg: 1, min: 1, max: 1, accuracy: 'exact' },
    ]);
    expect(traceBuckets(sample(), { start: 0, end: 3, buckets: 1 })[0].avg).toBeCloseTo(4 / 3);
  });
  it('pages exact records, honors cancellation and distinguishes truncated search', async () => {
    const provider = traceProvider(sample(), 'test');
    expect((await provider.fetchRows(1, 1, signal()))[0].name).toBe('Layout');
    const aborted = new AbortController();
    aborted.abort();
    await expect(provider.fetchRows(0, 1, aborted.signal)).rejects.toThrow();
    const query = { kind: 'predicate', field: 'duration', operator: '>', value: 0 } as const;
    expect(
      await provider.search!(query, { fromIndex: 0, limit: 1, signal: signal() }),
    ).toMatchObject({ complete: false, matches: [{ index: 1 }] });
    expect(
      await provider.search!(query, { fromIndex: 0, limit: 2, signal: signal() }),
    ).toMatchObject({ complete: true, matches: [{ index: 1 }, { index: 2 }] });
  });
  it('loads the actual bundled fixture and its exact summary agrees with its rows', () => {
    const recording = parseTrace(
      readFileSync(new URL('../src/data/fixtures/exploration-trace.json', import.meta.url), 'utf8'),
    );
    expect(recording.rows.length).toBeGreaterThan(100);
    expect(recording.duration).toBeGreaterThan(0);
    expect(
      traceBuckets(recording, { start: 0, end: recording.rows.length, buckets: 1 })[0].max,
    ).toBe(recording.rows[recording.longestIndex].duration);
  });
});
