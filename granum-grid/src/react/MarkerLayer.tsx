import { memo, useMemo, useRef, useState } from 'react';
import { useModalDialog } from './useModalDialog.js';
import type { Marker } from '../data/types.js';
import type { GranumGridEngine } from '../core/engine.js';
import { rowToProgress } from '../core/mappings.js';

/** Markers listed per page in a group's dialog. */
const PAGE_SIZE = 40;
/** Markers closer than this many CSS px share one rail button. */
const GROUP_GAP = 28;
/** Marker names listed in a group's tooltip. */
const TOOLTIP_NAMES = 5;
/** A group is named after its most severe marker. */
const KIND_RANK: Record<Marker['kind'], number> = {
  error: 0,
  spike: 1,
  bookmark: 2,
  event: 3,
  selection: 4,
  search: 5,
};

/**
 * Group in row order by screen distance. Each group starts at least GROUP_GAP px below the
 * previous one, so metadata count never determines rail DOM size and neighbors on either side
 * of a fixed bin edge never overlap.
 */
export function clusterMarkers(markers: readonly Marker[], total: number, height: number) {
  const groups: Marker[][] = [];
  let start = -Infinity;
  for (const marker of [...markers].sort((a, b) => a.index - b.index)) {
    const y = rowToProgress(marker.index, total) * Math.max(1, height);
    if (y - start < GROUP_GAP) groups[groups.length - 1].push(marker);
    else {
      groups.push([marker]);
      start = y;
    }
  }
  return groups;
}
/** The marker that names a group: the most severe kind, then the earliest row. */
export function leadMarker(group: readonly Marker[]) {
  return group.reduce((lead, marker) =>
    KIND_RANK[marker.kind] < KIND_RANK[lead.kind] ? marker : lead,
  );
}
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
      const group = { items, lead: leadMarker(items), first };
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
      {groups.map(({ items, lead, first }) => {
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
        const number = clustered ? items.length : first;
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
