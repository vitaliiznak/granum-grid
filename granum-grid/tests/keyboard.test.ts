import { expect, it } from 'vitest';
import { createEngine } from '../src/core/engine';
import { handleMovementKey, handleViewportKey } from '../src/react/keyboard';

const key = (
  name: string,
  modifiers: Partial<Record<'alt' | 'ctrl' | 'meta' | 'shift', boolean>> = {},
) => {
  const event = {
    key: name,
    altKey: !!modifiers.alt,
    ctrlKey: !!modifiers.ctrl,
    metaKey: !!modifiers.meta,
    shiftKey: !!modifiers.shift,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
  };
  return event;
};
const setup = (rowCount = 1000) => {
  const engine = createEngine({ rowCount, rowHeight: 20 });
  engine.setViewport(200);
  engine.setMotion(false);
  const calls = { jump: 0, announcements: [] as string[] };
  const options = {
    engine,
    openJump: () => calls.jump++,
    announce: (message: string) => calls.announcements.push(message),
  };
  return {
    engine,
    calls,
    press: (event: ReturnType<typeof key>) => handleViewportKey(event, options),
  };
};

it('moves one row per arrow and one viewport minus a row per page, announcing the row', () => {
  const { engine, calls, press } = setup();
  press(key('ArrowDown'));
  press(key('ArrowDown'));
  press(key('ArrowUp'));
  expect(engine.getSnapshot().position).toBe(1);
  press(key('PageDown'));
  // 200 px viewport, 20 px rows: nine rows of travel keep one row of context.
  expect(engine.getSnapshot().position).toBe(10);
  press(key('PageUp'));
  expect(engine.getSnapshot().position).toBe(1);
  expect(calls.announcements).toEqual(['Row 2', 'Row 3', 'Row 2', 'Row 11', 'Row 2']);
});

it('pages by at least one row when the viewport is shorter than two rows', () => {
  const { engine, press } = setup();
  engine.setViewport(25);
  press(key('PageDown'));
  expect(engine.getSnapshot().position).toBe(1);
});

it('reaches both endpoints with Home and End and records history', () => {
  const { engine, press } = setup();
  const end = key('End');
  press(end);
  expect(end.prevented).toBe(true);
  expect(engine.getSnapshot().activeIndex).toBe(999);
  press(key('Home'));
  expect(engine.getSnapshot().activeIndex).toBe(0);
  expect(engine.getSnapshot().canGoBack).toBe(true);
});

it('opens search and navigates history, chapters, and markers with their shortcuts', () => {
  const { engine, calls, press } = setup();
  engine.setMetadata(
    [
      { id: 'a', index: 100, label: 'A', kind: 'event' },
      { id: 'b', index: 500, label: 'B', kind: 'spike' },
    ],
    [
      { id: 'one', start: 0, end: 300, label: 'One' },
      { id: 'two', start: 300, end: 1000, label: 'Two' },
    ],
  );
  press(key('/'));
  press(key('k', { meta: true }));
  expect(calls.jump).toBe(2);
  press(key('n'));
  expect(engine.getSnapshot().position).toBe(100);
  press(key('n'));
  expect(engine.getSnapshot().position).toBe(500);
  press(key('P', { shift: true }));
  expect(engine.getSnapshot().position).toBe(100);
  press(key('ArrowDown', { ctrl: true }));
  expect(engine.getSnapshot().position).toBe(300);
  press(key('ArrowUp', { meta: true }));
  expect(engine.getSnapshot().position).toBe(0);
  press(key('ArrowLeft', { alt: true }));
  expect(engine.getSnapshot().position).toBe(300);
  press(key('ArrowRight', { alt: true }));
  expect(engine.getSnapshot().position).toBe(0);
});

it('leaves browser shortcuts alone', () => {
  const { engine, press } = setup();
  for (const event of [key('p', { ctrl: true }), key('n', { meta: true }), key('a')]) {
    press(event);
    expect(event.prevented).toBe(false);
  }
  expect(engine.getSnapshot().position).toBe(0);
});

it('pages with Space only where document scrolling is replaced', () => {
  const { engine } = setup();
  expect(handleMovementKey(key(' '), engine)).toBe(false);
  expect(handleMovementKey(key(' '), engine, { space: true })).toBe(true);
  expect(engine.getSnapshot().position).toBe(9);
  expect(handleMovementKey(key(' ', { shift: true }), engine, { space: true })).toBe(true);
  expect(engine.getSnapshot().position).toBe(0);
  expect(handleMovementKey(key('ArrowDown', { alt: true }), engine)).toBe(false);
});
