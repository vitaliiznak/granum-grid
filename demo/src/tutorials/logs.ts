import {
  createArrayProvider,
  type DataProvider,
  type Marker,
  type ProviderQuery,
} from '@granum-grid/react';

export type Log = { service: string; status: number; message: string };
const rows: Log[] = Array.from({ length: 600 }, (_, index) => ({
  service: ['auth', 'api', 'worker'][index % 3],
  status: index % 30 === 0 ? 503 : 200,
  message: index % 30 === 0 ? 'Upstream unavailable' : 'Request completed',
}));

function matches(query: ProviderQuery): (row: Log) => boolean {
  if (query.kind === 'text' && query.value.trim()) {
    const text = query.value.trim().toLowerCase();
    return (row) => `${row.service} ${row.status} ${row.message}`.toLowerCase().includes(text);
  }
  if (query.kind === 'predicate') {
    const value = query.value;
    if (
      query.field === 'status' &&
      query.operator === '>=' &&
      typeof value === 'number' &&
      Number.isFinite(value)
    )
      return (row) => row.status >= value;
    if (query.field === 'service' && query.operator === '=' && typeof value === 'string')
      return (row) => row.service.toLowerCase() === value.toLowerCase();
  }
  throw new Error('Use text, status >= number, or service = "name". Dates are not supported.');
}

export const logs: DataProvider<Log> = {
  ...createArrayProvider(rows, { id: 'tutorial-logs', revision: '1' }),
  searchHelp: {
    examples: ['status >= 500', 'service = "auth"', 'unavailable'],
    text: true,
    dates: false,
    fields: [
      { name: 'status', type: 'number', operators: ['>='] },
      { name: 'service', type: 'text', operators: ['='] },
    ],
  },
  async search(query, { limit, signal }) {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new RangeError('Expected a result limit from 1 to 100');
    const match = matches(query);
    const found: Marker[] = [];
    // A bounded 600-row fixture, searched in row order. Remote datasets need a server query.
    for (let index = 0; index < rows.length; index++) {
      if (!match(rows[index])) continue;
      if (found.length === limit)
        return {
          matches: found,
          complete: false,
          message: 'More matches exist; narrow the query.',
        };
      found.push({
        id: `log-${index}`,
        index,
        label: `${rows[index].service} · ${rows[index].status} · ${rows[index].message}`,
        kind: 'search',
      });
    }
    return { matches: found, complete: true };
  },
};
