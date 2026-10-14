import { expect, it } from 'vitest';
import { createEngine } from '../src/index';
import { bucketAt, chapterAt, parseJump } from '../src/core/navigation';
import type { Bucket } from '../src/data/types';
it('records a whole scrub once and restores pre-jump fractional state', () => {
  const e = createEngine({ rowCount: 100_000_000 });
  e.pan(8);
  e.beginScrub();
  e.scrub(12_000_000);
  e.scrub(30_000_000);
  e.endScrub();
  e.back();
  expect(e.getSnapshot().position).toBe(0.25);
  expect(e.getSnapshot().canGoBack).toBe(false);
  e.forward();
  expect(e.getSnapshot().position).toBe(30_000_000);
  e.beginScrub();
  e.scrub(7);
  e.endScrub(true);
  expect(e.getSnapshot().position).toBe(30_000_000);
  e.back();
  e.goTo(100);
  expect(e.getSnapshot().canGoForward).toBe(false);
});
it('arrives at once, and Back and Forward keep a pan made after a jump', () => {
  const e = createEngine({ rowCount: 100_000_000 });
  e.goTo(73_499_999);
  expect(e.getSnapshot().position).toBe(73_499_999);
  e.goTo(3);
  e.pan(32);
  const panned = e.getSnapshot().position;
  e.back();
  expect(e.getSnapshot().position).toBe(73_499_999);
  e.forward();
  expect(e.getSnapshot().position).toBe(panned);
});
it('parses exact addresses and rejects invalid dates and out-of-range values', () => {
  expect(parseJump('73,500,000', 100_000_000, 0, [])).toMatchObject({
    kind: 'index',
    index: 73_499_999,
  });
  expect(parseJump('100%', 100_000_000, 0, [])).toMatchObject({ index: 99_999_999 });
  expect(parseJump('2017-02-30', 100_000_000, 0, [])).toMatchObject({ kind: 'error' });
  expect(parseJump('2017-03', 100_000_000, 0, [])).toMatchObject({
    query: { kind: 'date', value: '2017-03' },
  });
  expect(parseJump('value > 120', 100_000_000, 0, [])).toMatchObject({
    query: { field: 'value', operator: '>', value: 120 },
  });
  expect(parseJump('101%', 100, 0, [])).toMatchObject({ kind: 'error' });
  const markers = [
    { id: 'a', index: 20, label: 'Deploy', kind: 'event' as const },
    { id: 'b', index: 30, label: 'Mine', kind: 'bookmark' as const },
  ];
  expect(parseJump('next bookmark', 100, 0, markers)).toMatchObject({ index: 30, label: 'Mine' });
  expect(parseJump('previous bookmark', 100, 30, markers)).toMatchObject({ kind: 'error' });
});
it('routes plain text to the provider without hiding malformed predicates or date errors', () => {
  expect(parseJump('  AuTh  ', 4_000_000_000, 0, [])).toEqual({
    kind: 'provider',
    query: { kind: 'text', value: 'AuTh' },
  });
  expect(parseJump('4,000,000,000', 4_000_000_000, 0, [])).toMatchObject({ index: 3_999_999_999 });
  expect(parseJump('2026', 4_000_000_000, 0, [])).toMatchObject({ index: 2025 });
  expect(parseJump('date 2026', 4_000_000_000, 0, [])).toMatchObject({
    query: { kind: 'date', value: '2026' },
  });
  for (const query of ['service = auth', 'status >=', '2026-09-31', '101%'])
    expect(parseJump(query, 4_000_000_000, 0, [])).toMatchObject({ kind: 'error' });
});
it('finds the chapter containing a fractional position, including gaps and endpoints', () => {
  const chapters = [
    { id: 'a', start: 0, end: 10, label: 'A' },
    { id: 'b', start: 10, end: 20, label: 'B' },
    // Rows 20-29 belong to no chapter.
    { id: 'c', start: 30, end: 4_000_000_000, label: 'C' },
  ];
  expect(chapterAt(chapters, 0)?.id).toBe('a');
  expect(chapterAt(chapters, 9.99)?.id).toBe('a');
  expect(chapterAt(chapters, 10)?.id).toBe('b');
  expect(chapterAt(chapters, 25)).toBeUndefined();
  expect(chapterAt(chapters, 3_999_999_999.5)?.id).toBe('c');
  expect(chapterAt(chapters, 4_000_000_000)).toBeUndefined();
  expect(chapterAt(chapters, -1)).toBeUndefined();
  expect(chapterAt([], 5)).toBeUndefined();
});
it('finds the overview bucket containing a row, including boundaries and the ends', () => {
  const bucket = (start: number, end: number): Bucket => ({
    start,
    end,
    count: end - start,
    avg: start,
    min: start,
    max: start,
    accuracy: 'exact',
  });
  // Contiguous coverage, as `checkBuckets` guarantees.
  const buckets = [bucket(0, 10), bucket(10, 11), bucket(11, 4_000_000_000)];
  expect(bucketAt(buckets, 0)).toBe(buckets[0]);
  expect(bucketAt(buckets, 9)).toBe(buckets[0]);
  expect(bucketAt(buckets, 9.5)).toBe(buckets[0]);
  expect(bucketAt(buckets, 10)).toBe(buckets[1]);
  expect(bucketAt(buckets, 11)).toBe(buckets[2]);
  expect(bucketAt(buckets, 3_999_999_999)).toBe(buckets[2]);
  expect(bucketAt(buckets, 4_000_000_000)).toBeUndefined();
  expect(bucketAt(buckets, -1)).toBeUndefined();
  expect(bucketAt([], 0)).toBeUndefined();
});
