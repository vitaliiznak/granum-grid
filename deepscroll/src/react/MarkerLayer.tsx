import { memo, useMemo, useRef, useState, useEffect } from 'react';
import type { Marker } from '../data/types.js';
import type { DeepScrollEngine } from '../core/engine.js';

/** Bucket by screen-space: metadata count never determines rail DOM size. */
export function clusterMarkers(markers: readonly Marker[], total: number, height: number) {
  const cells = new Map<number, Marker[]>();
  for (const marker of markers) {
    const cell = Math.floor(((marker.index / Math.max(1, total - 1)) * Math.max(1, height)) / 28);
    const group = cells.get(cell);
    if (group) group.push(marker);
    else cells.set(cell, [marker]);
  }
  return [...cells.values()];
}
export const MarkerLayer = memo(function MarkerLayer({
  markers,
  total,
  height,
  controller,
  labels,
}: {
  markers: readonly Marker[];
  total: number;
  height: number;
  controller: DeepScrollEngine;
  labels?: 'label' | 'number' | 'none';
}) {
  const groups = useMemo(() => clusterMarkers(markers, total, height), [markers, total, height]);
  const [open, setOpen] = useState<Marker[] | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, [open]);
  const matches = useMemo(
    () => (open ?? []).filter((m) => m.label.toLowerCase().includes(query.toLowerCase())),
    [open, query],
  );
  return (
    <>
      {groups.map((group, index) => {
        const marker = group[0],
          clustered = group.length > 1;
        const name = clustered
          ? `${group.length} events near row ${(marker.index + 1).toLocaleString()}`
          : marker.label;
        return (
          <button
            key={`${marker.id}:${marker.index}`}
            className="ds-button ds-marker"
            aria-label={name}
            title={name}
            style={{
              top: `${(marker.index / Math.max(1, total - 1)) * 100}%`,
              color: marker.color,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (clustered) {
                setQuery('');
                setPage(0);
                setOpen(group);
              } else controller.goTo(marker.index, { reason: 'marker' });
            }}
          >
            <span aria-hidden="true" className="ds-marker-symbol">
              {clustered ? '●' : '◆'}
            </span>
            <span className="ds-marker-label">
              {clustered
                ? `${group.length} events`
                : labels === 'number'
                  ? index + 1
                  : marker.label}
            </span>
            <span className="ds-marker-number">{clustered ? group.length : index + 1}</span>
          </button>
        );
      })}
      <dialog
        className="ds-jump"
        ref={dialog}
        aria-label="Events in this region"
        onCancel={() => setOpen(null)}
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (e.target === e.currentTarget) setOpen(null);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="ds-jump-inner">
          <div className="ds-jump-heading">
            <strong>Events in this region</strong>
            <button className="ds-button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <input
            className="ds-input"
            aria-label="Find an event"
            placeholder="Find an event…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <p role="status">{matches.length.toLocaleString()} events</p>
          <div className="ds-jump-results">
            {matches.slice(page * 40, (page + 1) * 40).map((m) => (
              <button
                className="ds-button"
                key={`${m.id}:${m.index}`}
                onClick={() => {
                  controller.goTo(m.index, { reason: 'marker' });
                  setOpen(null);
                }}
              >
                {m.label}
                <small>Row {(m.index + 1).toLocaleString()}</small>
              </button>
            ))}
          </div>
          <div className="ds-panel-actions">
            <button className="ds-button" disabled={!page} onClick={() => setPage(page - 1)}>
              Previous events
            </button>
            <button
              className="ds-button"
              disabled={(page + 1) * 40 >= matches.length}
              onClick={() => setPage(page + 1)}
            >
              More events
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
});
