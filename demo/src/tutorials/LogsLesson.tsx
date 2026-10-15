import { useRef } from 'react';
import { GranumGrid, type GranumGridApi } from '@granum-grid/react';
import { logs, type Log } from './logs';
import '@granum-grid/react/styles.css';

export default function Logs() {
  const api = useRef<GranumGridApi<Log>>(null);
  return (
    <section aria-label="Log search lesson">
      <p>600 generated log entries. Find the 20 errors, then search for auth.</p>
      <button
        onClick={(event) => {
          event.currentTarget.focus();
          api.current?.openSearch('status >= 500');
        }}
      >
        Find errors
      </button>
      <GranumGrid
        provider={logs}
        apiRef={api}
        ariaLabel="Application logs"
        rowHeight={48}
        style={{ height: 560, marginTop: 16 }}
        rail={false}
        toolbar
        footer
        renderRow={({ row, rowNumber }) => (
          <span role="gridcell">
            {rowNumber}. {row.service} · {row.status} · {row.message}
          </span>
        )}
      />
    </section>
  );
}
