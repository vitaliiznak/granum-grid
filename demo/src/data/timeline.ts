import type { Chapter } from '@granum-grid/react';

/**
 * Rows spread evenly across UTC milliseconds `[start, end)`. Worker-safe; shared by the
 * generated datasets so time and row addresses convert the same way everywhere.
 */
export function timeline(start: number, end: number, rowCount: number) {
  const span = end - start - 1;
  const indexAt = (time: number) => Math.ceil(((time - start) / span) * (rowCount - 1));
  return {
    timeAt: (index: number) => start + (index / Math.max(1, rowCount - 1)) * span,
    /** First row at or after `time`. */
    indexAt,
    /** Row for a `YYYY`, `YYYY-MM`, or `YYYY-MM-DD` query; a bare year starts on `yearStart`. */
    dateIndex(text: string, yearStart = '01-01') {
      const day =
        text.length === 4 ? `${text}-${yearStart}` : text.length === 7 ? `${text}-01` : text;
      const time = Date.parse(`${day}T00:00:00Z`);
      return Number.isFinite(time) && time >= start && time < end ? indexAt(time) : null;
    },
    /** One chapter per boundary time; each ends where the next begins, the last at the end. */
    chapters(
      times: readonly number[],
      describe: (time: number, i: number) => Pick<Chapter, 'id' | 'label' | 'breadcrumb'>,
    ): Chapter[] {
      return times.map((time, i) => ({
        ...describe(time, i),
        start: indexAt(time),
        end: i === times.length - 1 ? rowCount : indexAt(times[i + 1]),
      }));
    },
  };
}
