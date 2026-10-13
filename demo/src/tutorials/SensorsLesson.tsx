import { useRef } from 'react';
import { GranumGrid, type GranumGridApi } from 'granum-grid';
import { sensors, type Reading } from './sensors';
import 'granum-grid/styles.css';

export default function Sensors() {
  const api = useRef<GranumGridApi<Reading>>(null);
  return (
    <section aria-label="Sensor lesson">
      <p>1,440 generated minute readings. Inspect the 20-minute warm interval.</p>
      <button onClick={() => api.current?.zoomToRange({ start: 0, end: 1440 })}>
        See the whole day
      </button>{' '}
      <button
        onClick={() => {
          api.current?.setSelection({ start: 720, end: 740 });
          api.current?.scrollToIndex(720, { align: 'start' });
        }}
      >
        Inspect warm interval
      </button>
      <GranumGrid
        provider={sensors}
        apiRef={api}
        ariaLabel="Sensor readings"
        style={{ height: 680, marginTop: 16 }}
        features={{ hints: false }}
        renderRow={({ row }) => (
          <span role="gridcell">
            Minute {row.minute} · {row.celsius} °C
          </span>
        )}
      />
    </section>
  );
}
