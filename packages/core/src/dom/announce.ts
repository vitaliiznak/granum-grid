import type { GranumGridEngine, NavigationEvent } from '../core/engine.js';
import { chapterAt } from '../core/navigation.js';
import type { Chapter } from '../data/types.js';

/**
 * What a screen reader hears after a committed jump: the row, and its chapter when there is
 * one. A jump below the end clamp names the requested row, not the first visible one.
 */
export function jumpAnnouncement(
  engine: Pick<GranumGridEngine, 'getSnapshot'>,
  chapters: readonly Chapter[],
  event: NavigationEvent,
): string {
  const chapter = chapterAt(chapters, event.to.position);
  const row = engine.getSnapshot().activeIndex ?? Math.floor(event.to.position);
  return `Jumped to row ${(row + 1).toLocaleString()}${chapter ? `, ${chapter.label}` : ''}`;
}
