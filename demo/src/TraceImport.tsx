import { useEffect, useRef, useState } from 'react';
import { MAX_TRACE_BYTES, TRACE_LIMITS, TRACE_TOO_LARGE, parseTrace } from './data/trace';
import { performance, performanceDataset } from './datasets/performance';
import type { DemoDataset } from './datasets';

export function TraceImport({
  onLoad,
  imported,
}: {
  onLoad(dataset: DemoDataset): void;
  imported: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <div className="trace-import">
      <label className="trace-file-button">
        {busy ? 'Reading recording…' : 'Open Chrome trace JSON'}
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          aria-label="Open Chrome trace JSON"
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (!file) return;
            const current = ++generation.current;
            setError('');
            setBusy(true);
            try {
              if (file.size > MAX_TRACE_BYTES) throw new Error(TRACE_TOO_LARGE);
              const recording = parseTrace(await file.text());
              if (generation.current === current)
                onLoad(performanceDataset(recording, file.name, `local-${crypto.randomUUID()}`));
            } catch (error) {
              if (generation.current === current)
                setError(error instanceof Error ? error.message : 'Could not read this file.');
            } finally {
              if (generation.current === current) setBusy(false);
            }
          }}
        />
      </label>
      {imported && (
        <button
          onClick={() => {
            generation.current++;
            setBusy(false);
            setError('');
            onLoad(performance);
          }}
        >
          Restore bundled recording
        </button>
      )}
      <span>Local only · JSON up to {TRACE_LIMITS} · X and I/i events</span>
      {imported && (
        <span>Your file stays in this tab; reloading restores the bundled recording.</span>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
