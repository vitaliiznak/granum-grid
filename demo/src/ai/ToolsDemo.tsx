import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DataProvider, GranumGridApi, ProviderQuery } from 'granum-grid';
import { createTableTools } from './table-tools';
import './tools-demo.css';

const searches: Record<string, ProviderQuery> = {
  performance: { kind: 'predicate', field: 'duration', operator: '>', value: 10 },
  signal: { kind: 'predicate', field: 'value', operator: '>', value: 120 },
  genome: { kind: 'predicate', field: 'gc', operator: '>', value: 52 },
  market: { kind: 'predicate', field: 'size', operator: '>', value: 5000 },
  logs: { kind: 'predicate', field: 'status', operator: '>=', value: 500 },
  stars: { kind: 'predicate', field: 'mag', operator: '<', value: 6 },
  bitcoin: { kind: 'predicate', field: 'high', operator: '>=', value: 100_000 },
};
const labels: Record<string, string> = {
  describe_table: 'Describe the table',
  read_rows: 'Read a few rows',
  search_rows: 'Find matching rows',
  summarize_range: 'Summarize the dataset',
  navigate_to_row: 'Jump to a row',
};

export function ToolsDemo<Row>({
  provider,
  apiRef,
  datasetId,
}: {
  provider: DataProvider<Row>;
  apiRef: RefObject<GranumGridApi<Row> | null>;
  datasetId: string;
}) {
  const tools = useMemo(
    () => createTableTools({ provider, getTable: () => apiRef.current }),
    [provider, apiRef],
  );
  const [name, setName] = useState('describe_table');
  const [args, setArgs] = useState('{}');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [tools],
  );

  const selectTool = (next: string) => {
    const start = apiRef.current?.controller.getSnapshot().activeIndex ?? 0;
    const examples: Record<string, unknown> = {
      describe_table: {},
      read_rows: { start, count: Math.min(5, provider.rowCount - start) },
      search_rows: { query: searches[datasetId], fromIndex: 0, limit: 5 },
      summarize_range: { start: 0, end: provider.rowCount, buckets: 4 },
      navigate_to_row: { index: Math.floor(provider.rowCount / 2) },
    };
    setName(next);
    setArgs(JSON.stringify(examples[next], null, 2));
    setResult('');
    setStatus('');
  };
  const run = async () => {
    let input: unknown;
    try {
      input = JSON.parse(args);
    } catch {
      setStatus('Arguments must be valid JSON.');
      return;
    }
    const request = new AbortController();
    active.current = request;
    setBusy(true);
    setStatus('Running tool…');
    const response = await tools.execute(name, input, { signal: request.signal });
    if (active.current !== request) return;
    active.current = null;
    setBusy(false);
    setResult(JSON.stringify(response, null, 2));
    setStatus(response.ok ? 'Tool completed.' : response.error.message);
    if (response.ok && name === 'navigate_to_row')
      document.querySelector('.demo-explorer')?.scrollIntoView({ block: 'center' });
  };
  return (
    <details className="integration ai-tools-demo">
      <summary>
        Try AI-callable tools <small>Example integration using the public table API</small>
      </summary>
      <div className="playground-inner">
        <p>
          Run the structured calls an AI could make against the table above. This demo has no model
          connected.
        </p>
        <label>
          Operation
          <select value={name} disabled={busy} onChange={(event) => selectTool(event.target.value)}>
            {tools.definitions.map((tool) => (
              <option key={tool.name} value={tool.name}>
                {labels[tool.name]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Arguments (JSON)
          <textarea
            value={args}
            disabled={busy}
            rows={6}
            spellCheck={false}
            onChange={(event) => setArgs(event.target.value)}
          />
        </label>
        <div className="ai-tools-actions">
          <button type="button" disabled={busy} onClick={run}>
            Run tool
          </button>
          {busy && (
            <button type="button" onClick={() => active.current?.abort()}>
              Cancel
            </button>
          )}
          <code>{name}</code>
        </div>
        <p role="status">{status}</p>
        {result && (
          <label>
            Tool result
            <textarea value={result} readOnly rows={9} spellCheck={false} />
          </label>
        )}
        <details>
          <summary>Tool definitions</summary>
          <pre>{JSON.stringify(tools.definitions, null, 2)}</pre>
        </details>
      </div>
    </details>
  );
}
