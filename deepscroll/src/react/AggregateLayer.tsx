import type { ReactNode } from 'react';
import type { Bucket, RowRange } from '../data/types.js';
import type { DeepScrollState } from './useDeepScroll.js';

export interface AggregateRenderContext {
  /** Provider-supplied summary. Accuracy and missing values must remain visible. */
  bucket: Bucket;
  visibleRange: RowRange;
  rowsPerPixel: number;
}

/** Bounded DOM summaries; actions and geometry stay owned by the library. */
export function AggregateLayer<Row>({ scroll, renderAggregate, formatRange }: {
  scroll: DeepScrollState<Row>;
  renderAggregate?(context: AggregateRenderContext): ReactNode;
  formatRange?(range: RowRange): string;
}) {
  const { session, snapshot, visibleRange, mapping } = scroll;
  const ready = session.aggregates[0]?.start === visibleRange.start &&
    session.aggregates.at(-1)?.end === visibleRange.end &&
    session.aggregates.length <= scroll.aggregateBuckets;
  if (!ready) return <div className="ds-summary-status" role="status">
    {session.metadataErrors.aggregates ? 'Range summaries unavailable. Use Inspect rows to continue.' : 'Loading range summaries…'}
  </div>;
  return <>{session.aggregates.map(bucket => {
    const top = Math.max(0, mapping.toPixel(bucket.start));
    const bottom = Math.min(snapshot.height, mapping.toPixel(bucket.end));
    if (bottom - top < 48) return null;
    const label = formatRange?.(bucket) ?? bucket.label ?? `Rows ${(bucket.start + 1).toLocaleString()}–${bucket.end.toLocaleString()}`;
    const navigate = (inspect: boolean) => {
      if (inspect) scroll.controller.scrollToIndex(bucket.start, { align: 'start' });
      else scroll.controller.zoomToRange(bucket);
      // Summary controls can unmount during navigation. Keep keyboard input in the explorer.
      document.getElementById(`${scroll.id}-viewport`)?.focus({ preventScroll: true });
    };
    return <div key={`${bucket.start}:${bucket.end}`} className="ds-summary-band" role="row"
      aria-rowindex={bucket.start + 1} data-ds-part="aggregate" style={{ top, height: bottom - top }}>
      <div className="ds-summary-content" role="gridcell">
        <div className="ds-summary-heading"><strong>{label}</strong><span className="ds-summary-accuracy">{bucket.accuracy === 'estimated' ? 'Estimated' : bucket.accuracy === 'exact' ? 'Exact' : 'Unavailable'}</span></div>
        {renderAggregate ? renderAggregate({ bucket, visibleRange, rowsPerPixel: snapshot.rowsPerPixel }) : <p>
          {(bucket.end - bucket.start).toLocaleString()} rows · {scroll.provider.metric?.label ?? 'Mean'}: {bucket.avg?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? 'unavailable'} {scroll.provider.metric?.unit}
        </p>}
        <div className="ds-summary-actions">
          <button className="ds-button" disabled={bucket.end - bucket.start <= 1 || (bucket.start === visibleRange.start && bucket.end === visibleRange.end)} onClick={() => navigate(false)}>Zoom into range</button>
          <button className="ds-button" onClick={() => navigate(true)}>Inspect these rows</button>
          <button className="ds-button" onClick={() => scroll.setSelection({ start: bucket.start, end: bucket.end })}>Select</button>
        </div>
      </div>
    </div>;
  })}</>;
}
