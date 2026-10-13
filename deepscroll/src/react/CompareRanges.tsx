import { useEffect, useMemo, useRef, useState } from 'react';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import type { RowRange } from '../data/types.js';
import type { DeepScrollEngine } from '../core/engine.js';
import { rangeProvider } from '../data/range.js';
import { DeepScroll, type DeepScrollProps } from './DeepScroll.js';
import { RangeSummary } from './ExplorerTools.js';

export function CompareRanges<Row>({
  a,
  b,
  host,
  onClose,
}: {
  a: RowRange;
  b: RowRange;
  host: DeepScrollProps<Row>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const left = useRef<DeepScrollEngine>(null),
    right = useRef<DeepScrollEngine>(null);
  const [linked, setLinked] = useState(true);
  const providers = useMemo(
    () => [rangeProvider(host.provider, a), rangeProvider(host.provider, b)],
    [host.provider, a.start, a.end, b.start, b.end],
  );
  useClientLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!linked || !left.current || !right.current) return;
    let syncing = false;
    const sync = (from: DeepScrollEngine, to: DeepScrollEngine) => {
      if (syncing) return;
      syncing = true;
      try {
        const s = from.getSnapshot();
        const progress = s.position / Math.max(1, s.rowCount - 1);
        to.scrub(progress * Math.max(0, to.getSnapshot().rowCount - 1));
      } finally {
        syncing = false;
      }
    };
    const l = left.current,
      r = right.current;
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
            <DeepScroll
              provider={providers[i]}
              ariaLabel={`${i === 0 ? 'First' : 'Second'} range rows`}
              controllerRef={i === 0 ? left : right}
              rowHeight={host.rowHeight}
              dynamicRowHeight={host.dynamicRowHeight}
              theme={host.theme}
              unstyled={host.unstyled}
              classNames={host.classNames}
              styles={host.styles}
              exploration={false}
              features={{
                flight: false,
                automaticAggregation: false,
                hints: false,
                prefetch: false,
              }}
              reducedMotion
              renderToolbar={() => null}
              renderRail={() => null}
              renderFooter={() => null}
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
