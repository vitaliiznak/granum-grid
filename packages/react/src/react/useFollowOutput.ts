import { useEffect, useState } from 'react';
import { atEnd, type GranumGridEngine, type NavigationSnapshot } from '@granum/core/internal';
import type { DataSession } from '@granum/core/internal';
import type { DataProvider } from '@granum/core/data';

/** Apply append-only row counts and count rows added while the reader is away from the end. */
export function useFollowOutput<Row>(
  engine: GranumGridEngine,
  session: DataSession<Row>,
  provider: DataProvider<Row>,
  followOutput: boolean | undefined,
  snapshot: NavigationSnapshot,
): number {
  const [unseenRows, setUnseenRows] = useState(0);
  useEffect(() => {
    if (followOutput === undefined) return;
    const before = engine.getSnapshot();
    const added = provider.rowCount - before.rowCount;
    const following = followOutput && atEnd(engine.rowSizes, before);
    session.updateAppendProvider(provider);
    engine.appendRows(provider.rowCount, followOutput);
    if (added > 0) setUnseenRows((value) => (following ? 0 : value + added));
  }, [engine, session, provider, provider.rowCount, followOutput]);
  useEffect(() => {
    if (atEnd(engine.rowSizes, snapshot)) setUnseenRows(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only the fields that move the end.
  }, [engine, snapshot.position, snapshot.rowCount, snapshot.height, snapshot.layoutVersion]);
  return unseenRows;
}
