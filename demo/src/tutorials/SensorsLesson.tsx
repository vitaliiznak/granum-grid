import { useRef, useState } from 'react';
import { GranumGrid, type Bucket, type GranumGridApi } from '@granum/react';
import { sensors, type Reading } from './sensors';
import '@granum/react/styles.css';

const WARM = { start: 720, end: 740 };

export default function Sensors() {
  const api = useRef<GranumGridApi<Reading>>(null);
  const [summary, setSummary] = useState<Bucket | null>(null);
  return (
    <section aria-label="Sensor lesson">
      <p>1,440 generated minute readings. Inspect the 20-minute warm interval.</p>
      <button
        onClick={async () => {
          api.current?.setSelection(WARM);
          api.current?.scrollToIndex(WARM.start, { align: 'start' });
          const signal = new AbortController().signal;
          const buckets = await sensors.fetchAggregates?.({ ...WARM, buckets: 1 }, signal);
          setSummary(buckets?.[0] ?? null);
        }}
      >
        Inspect warm interval
      </button>
      {summary && (
        <p role="status">
          Rows {WARM.start + 1}–{WARM.end} · {summary.count} readings · {summary.accuracy} · mean{' '}
          {summary.avg} °C · min {summary.min} °C · max {summary.max} °C
        </p>
      )}
      <GranumGrid
        provider={sensors}
        apiRef={api}
        ariaLabel="Sensor readings"
        style={{ height: 680, marginTop: 16 }}
        renderRow={({ row }) => (
          <span role="gridcell">
            Minute {row.minute} · {row.celsius} °C
          </span>
        )}
      />
    </section>
  );
}
