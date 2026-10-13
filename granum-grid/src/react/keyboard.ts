import type { GranumGridEngine } from '../core/engine.js';

type KeyInput = Pick<
  KeyboardEvent,
  'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'preventDefault'
>;

/**
 * Arrow, page, Home, and End movement shared by the focused viewport and page scrolling.
 * Arrows move exactly one row; pages keep one row of context, even in a short viewport.
 * With `space`, Space and Shift+Space page like the browser's document scrolling.
 * Returns whether the key moved the explorer.
 */
export function handleMovementKey(
  event: KeyInput,
  engine: GranumGridEngine,
  { space = false }: { space?: boolean } = {},
): boolean {
  const { key } = event;
  const { height, position, rowCount, rowHeight } = engine.getSnapshot();
  if (key === 'Home' || key === 'End') {
    event.preventDefault();
    engine.goTo(key === 'Home' ? 0 : Math.max(0, rowCount - 1), { reason: 'keyboard' });
    return true;
  }
  if (event.altKey || event.metaKey || event.ctrlKey) return false;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    event.preventDefault();
    engine.scrub(position + (key === 'ArrowDown' ? 1 : -1));
    return true;
  }
  const direction =
    key === 'PageDown' || (space && key === ' ' && !event.shiftKey)
      ? 1
      : key === 'PageUp' || (space && key === ' ' && event.shiftKey)
        ? -1
        : 0;
  if (!direction) return false;
  event.preventDefault();
  engine.pan(direction * Math.max(rowHeight, height - rowHeight));
  return true;
}

export interface ViewportKeyOptions {
  engine: GranumGridEngine;
  openJump(): void;
  announce(message: string): void;
}

/** Explorer keyboard navigation for a focused viewport. Reads the engine's current state. */
export function handleViewportKey(
  event: KeyInput,
  { engine, openJump, announce }: ViewportKeyOptions,
) {
  const key = event.key;
  if (key === '/' || ((event.metaKey || event.ctrlKey) && key.toLowerCase() === 'k')) {
    event.preventDefault();
    openJump();
    return;
  }
  if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
    event.preventDefault();
    if (key === 'ArrowLeft') engine.back();
    else engine.forward();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && (key === 'ArrowUp' || key === 'ArrowDown')) {
    event.preventDefault();
    if (key === 'ArrowUp') engine.previousChapter();
    else engine.nextChapter();
    return;
  }
  // Plain N/P only: modified keys such as Ctrl/Cmd+P belong to the browser.
  const letter = key.toLowerCase();
  if (!event.metaKey && !event.ctrlKey && !event.altKey && (letter === 'n' || letter === 'p')) {
    event.preventDefault();
    if (letter === 'n') engine.nextMarker();
    else engine.previousMarker();
    return;
  }
  if (key === 'Escape') {
    engine.cancel();
    return;
  }
  if (handleMovementKey(event, engine) && key !== 'Home' && key !== 'End')
    announce(`Row ${(engine.getSnapshot().activeIndex ?? 0) + 1}`);
}
