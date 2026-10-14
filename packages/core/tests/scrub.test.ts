import { describe, expect, it } from 'vitest';
import { beginScrub, moveScrub, rowAtPointer } from '../src/map/scrub';

// A 1,000-pixel track over a million rows: one pixel is about a thousand rows.
const track = { top: 0, height: 1000, rowCount: 1_000_001 };

describe('map drag math', () => {
  it('maps the pointer to a row, top to bottom', () => {
    expect(rowAtPointer(0, track).index).toBe(0);
    expect(rowAtPointer(500, track).index).toBe(500_000);
    expect(rowAtPointer(2000, track)).toMatchObject({ index: 1_000_000, y: 1000 });
  });

  it('grabs the current row near the thumb and jumps elsewhere', () => {
    const near = beginScrub(10, 510, track, {
      current: 500_000,
      progress: 0.5,
      peaks: [],
      free: false,
    });
    expect(near).toMatchObject({ position: 500_000, destination: 500_000 });
    const far = beginScrub(10, 200, track, {
      current: 500_000,
      progress: 0.5,
      peaks: [],
      free: false,
    });
    expect(far).toMatchObject({ origin: 500_000, destination: 200_000 });
  });

  it('slows with sideways distance and re-anchors so the position never jumps', () => {
    const scrub = beginScrub(0, 500, track, {
      current: 500_000,
      progress: 0.5,
      peaks: [],
      free: false,
    });
    expect(moveScrub(scrub, 0, 510, track).position).toBe(510_000);
    // 60 px sideways: half speed from where the pointer already is.
    const half = moveScrub(scrub, 60, 510, track);
    expect(half).toMatchObject({ position: 510_000, precision: '½ speed' });
    expect(moveScrub(scrub, 60, 530, track).position).toBe(520_000);
    // 250 px sideways: 1/20 speed.
    moveScrub(scrub, 250, 530, track);
    expect(moveScrub(scrub, 250, 550, track).position).toBe(521_000);
    expect(scrub.moved).toBe(true);
  });

  it('snaps slow moves to a nearby marker, but Shift and fast moves pass through', () => {
    const markers = [{ id: 'm', index: 304_000, label: 'Deploy', kind: 'event' }];
    const scrub = beginScrub(0, 300, track, {
      current: 300_000,
      progress: 0.3,
      peaks: [],
      free: false,
    });
    expect(moveScrub(scrub, 0, 302, track, { markers }).position).toBe(304_000);
    const free = beginScrub(0, 300, track, {
      current: 300_000,
      progress: 0.3,
      peaks: [],
      free: true,
    });
    expect(moveScrub(free, 0, 302, track, { markers, free: true }).position).toBe(302_000);
    const fast = beginScrub(0, 250, track, {
      current: 250_000,
      progress: 0.25,
      peaks: [],
      free: false,
    });
    expect(moveScrub(fast, 0, 302, track, { markers }).position).toBe(302_000);
  });
});
