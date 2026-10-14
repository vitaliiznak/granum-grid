import { memo, useMemo, useRef, useState } from 'react';
import { useModalDialog } from './useModalDialog.js';
import type { Marker } from '@granum/core/data';
import { clusterMarkers, leadMarker } from '@granum/core/map';
import { rowToProgress } from '@granum/core/internal';
import type { GranumGridEngine } from '@granum/core/internal';

/** Markers listed per page in a group's dialog. */
const PAGE_SIZE = 40;
/** Marker names listed in a group's tooltip. */
const TOOLTIP_NAMES = 5;
const count = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'marker' : 'markers'}`;
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
  controller: GranumGridEngine;
  labels?: 'label' | 'number' | 'none';
}) {
  const groups = useMemo(() => {
    // One-based position of each group's first marker in row order, so numbers stay correct
    // after a group.
    let first = 1;
    return clusterMarkers(markers, total, height).map((items) => {
      const lead = leadMarker(items);
      // The compact index is the named marker's own place. The group size stays on the +N
      // badge; painting it here makes a group of 3 followed by place 4 read as 3, 4.
      const group = { items, lead, number: first + items.indexOf(lead) };
      first += items.length;
      return group;
    });
  }, [markers, total, height]);
  const [open, setOpen] = useState<Marker[] | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useModalDialog(dialog, open !== null);
  const matches = useMemo(
    () => (open ?? []).filter((m) => m.label.toLowerCase().includes(query.toLowerCase())),
    [open, query],
  );
  return (
    <>
      {groups.map(({ items, lead, number }) => {
        const marker = items[0],
          clustered = items.length > 1,
          others = items.length - 1;
        const name = clustered
          ? `${lead.label} and ${others.toLocaleString()} more ${others === 1 ? 'marker' : 'markers'} near row ${(marker.index + 1).toLocaleString()}`
          : lead.label;
        const title = clustered
          ? [
              ...items.slice(0, TOOLTIP_NAMES).map((m) => m.label),
              ...(items.length > TOOLTIP_NAMES
                ? [`and ${(items.length - TOOLTIP_NAMES).toLocaleString()} more`]
                : []),
            ].join('\n')
          : lead.label;
        return (
          <button
            key={`${marker.id}:${marker.index}`}
            className="ds-button ds-marker"
            data-group={clustered || undefined}
            data-kind={lead.kind}
            aria-label={name}
            title={title}
            style={{
              top: `${rowToProgress(marker.index, total) * 100}%`,
              color: lead.color,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (clustered) {
                setQuery('');
                setPage(0);
                setOpen(items);
              } else controller.goTo(marker.index, { reason: 'marker' });
            }}
          >
            <span aria-hidden="true" className="ds-marker-symbol">
              {clustered ? '●' : lead.kind === 'bookmark' ? '★' : '◆'}
            </span>
            <span className="ds-marker-label">{labels === 'number' ? number : lead.label}</span>
            {clustered && labels !== 'number' && (
              <span className="ds-marker-more">+{others.toLocaleString()}</span>
            )}
            <span className="ds-marker-number">{number}</span>
          </button>
        );
      })}
      <dialog
        className="ds-jump"
        ref={dialog}
        aria-label="Markers in this region"
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
            <strong>Markers in this region</strong>
            <button className="ds-button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          <input
            className="ds-input"
            aria-label="Find a marker"
            placeholder="Find a marker…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <p role="status">{count(matches.length)}</p>
          <div className="ds-jump-results">
            {matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((m) => (
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
              Previous markers
            </button>
            <button
              className="ds-button"
              disabled={(page + 1) * PAGE_SIZE >= matches.length}
              onClick={() => setPage(page + 1)}
            >
              More markers
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
});
