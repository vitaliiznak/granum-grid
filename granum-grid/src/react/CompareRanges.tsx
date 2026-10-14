import { useEffect, useMemo, useRef, useState } from 'react';
import { useModalDialog } from './useModalDialog.js';
import type { RowRange } from '../data/types.js';
import type { GranumGridEngine } from '../core/engine.js';
import { engineOf, type GranumGridApi } from '../core/api.js';
import { rangeProvider } from '../data/range.js';
import { GranumGrid, type GranumGridProps } from './GranumGrid.js';
import { RangeSummary } from './RangeSummary.js';

/** The host explorer settings both comparison panes reuse. */
type ComparisonHost<Row> = Pick<
  GranumGridProps<Row>,
  | 'provider'
  | 'rowHeight'
  | 'dynamicRowHeight'
  | 'theme'
  | 'unstyled'
  | 'classNames'
  | 'styles'
  | 'renderRow'
>;

export function CompareRanges<Row>({
  a,
  b,
  host,
  onClose,
}: {
  a: RowRange;
  b: RowRange;
  host: ComparisonHost<Row>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const left = useRef<GranumGridApi<Row>>(null),
    right = useRef<GranumGridApi<Row>>(null);
  const [linked, setLinked] = useState(true);
  // Depend on the bounds, not the objects, so equal ranges keep their providers and caches.
  const [aStart, aEnd, bStart, bEnd] = [a.start, a.end, b.start, b.end];
  const providers = useMemo(
    () => [
      rangeProvider(host.provider, { start: aStart, end: aEnd }),
      rangeProvider(host.provider, { start: bStart, end: bEnd }),
    ],
    [host.provider, aStart, aEnd, bStart, bEnd],
  );
  useModalDialog(dialog, true);
  useEffect(() => {
    const l = left.current && engineOf(left.current),
      r = right.current && engineOf(right.current);
    if (!linked || !l || !r) return;
    let syncing = false;
    const sync = (from: GranumGridEngine, to: GranumGridEngine) => {
      if (syncing) return;
      syncing = true;
      try {
        // Unclamped, so a tall final row's fractional end carries over to the other pane.
        const s = from.getSnapshot();
        const progress = s.position / Math.max(1, s.rowCount - 1);
        to.scrub(progress * Math.max(0, to.getSnapshot().rowCount - 1));
      } finally {
        syncing = false;
      }
    };
    const offL = l.subscribe(() => sync(l, r)),
      offR = r.subscribe(() => sync(r, l));
    sync(l, r);
    return () => {
      offL();
      offR();
    };
  }, [linked, providers]);
  return (
    <dialog
      ref={dialog}
      className="ds-compare"
      aria-label="Compare selected ranges"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ds-panel-actions">
        <strong>Compare ranges</strong>
        <label>
          <input type="checkbox" checked={linked} onChange={(e) => setLinked(e.target.checked)} />{' '}
          Scroll together
        </label>
        <button className="ds-button" onClick={onClose}>
          Close comparison
        </button>
      </div>
      <p>
        Linked scrolling matches progress through each range, not timestamps or matching records.
      </p>
      <div className="ds-compare-panes">
        {[a, b].map((range, i) => (
          <section key={i}>
            <h3>{i === 0 ? 'First range' : 'Second range'}</h3>
            <RangeSummary provider={host.provider} range={range} />
            <GranumGrid
              provider={providers[i]}
              ariaLabel={`${i === 0 ? 'First' : 'Second'} range rows`}
              apiRef={i === 0 ? left : right}
              rowHeight={host.rowHeight}
              dynamicRowHeight={host.dynamicRowHeight}
              theme={host.theme}
              unstyled={host.unstyled}
              classNames={host.classNames}
              styles={host.styles}
              toolbar={false}
              tools={false}
              rail={false}
              footer={false}
              hints={false}
              features={{ flight: false, automaticAggregation: false, prefetch: false }}
              reducedMotion
              header="Records in selected range"
              style={{ height: 320 }}
              renderRow={(context) =>
                host.renderRow({
                  ...context,
                  index: context.index + range.start,
                  rowNumber: context.index + range.start + 1,
                })
              }
            />
          </section>
        ))}
      </div>
    </dialog>
  );
}
