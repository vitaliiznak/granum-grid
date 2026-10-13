import { expect, it } from 'vitest';
import { createEngine, parseJump } from '../src/core/index';
it('records a whole scrub once and restores pre-jump fractional state', () => {
  const e = createEngine({ rowCount: 100_000_000 });
  e.pan(8); e.beginScrub(); e.scrub(12_000_000); e.scrub(30_000_000); e.endScrub();
  e.back(); expect(e.getSnapshot().position).toBe(.25); expect(e.getSnapshot().canGoBack).toBe(false);
  e.forward(); expect(e.getSnapshot().position).toBe(30_000_000);
  e.beginScrub(); e.scrub(7); e.endScrub(true); expect(e.getSnapshot().position).toBe(30_000_000);
  e.back(); e.goTo(100); expect(e.getSnapshot().canGoForward).toBe(false);
});
it('finishes flights exactly and preserves history when interrupted', () => {
  const e = createEngine({ rowCount: 100_000_000 }); e.setMotion(true); e.goTo(73_499_999);
  e.step(0); e.step(210); expect(e.getSnapshot().position).toBeCloseTo(73_499_999 / 2);
  e.step(420); expect(e.getSnapshot().position).toBe(73_499_999); expect(e.getSnapshot().moving).toBe(false);
  e.goTo(3); e.step(500); e.step(650); e.pan(32); const interrupted = e.getSnapshot().position;
  expect(e.getSnapshot().moving).toBe(false); e.setMotion(false); e.back(); expect(e.getSnapshot().position).toBe(73_499_999); e.forward(); expect(e.getSnapshot().position).toBe(interrupted);
});
it('parses exact addresses and rejects invalid dates and out-of-range values', () => {
  expect(parseJump('73,500,000', 100_000_000, 0, [])).toMatchObject({ kind: 'index', index: 73_499_999 });
  expect(parseJump('100%', 100_000_000, 0, [])).toMatchObject({ index: 99_999_999 });
  expect(parseJump('2017-02-30', 100_000_000, 0, [])).toMatchObject({ kind: 'error' });
  expect(parseJump('2017-03', 100_000_000, 0, [])).toMatchObject({ query: { kind: 'date', value: '2017-03' } });
  expect(parseJump('value > 120', 100_000_000, 0, [])).toMatchObject({ query: { field: 'value', operator: '>', value: 120 } });
  expect(parseJump('101%', 100, 0, [])).toMatchObject({ kind: 'error' });
});
