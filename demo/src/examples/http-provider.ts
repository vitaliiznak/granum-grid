import type { DataProvider } from '@granum/react';

type LogLine = { time: string; message: string };

/** The whole contract: identity, a revision, a count, and any slice by address. */
export const logs: DataProvider<LogLine> = {
  id: 'logs',
  revision: '2026-09',
  rowCount: 4_000_000_000,
  fetchRows: (start, count, signal) =>
    fetch(`/api/logs?start=${start}&count=${count}`, { signal }).then((r) => r.json()),
};
