import type { ReactNode } from 'react';
import type { Bucket, RowRange } from '../data/types.js';
import type { GranumGridState } from './useGranumGrid.js';
import { formatDecimal, rangeAddress, rangeCount } from '../visuals/format.js';

export interface AggregateRenderContext {
  /** Provider-supplied summary. Accuracy and missing values must remain visible. */
  bucket: Bucket;
  visibleRange: RowRange;
  rowsPerPixel: number;
}

/** Bounded DOM summaries; actions and geometry stay owned by the library. */
export function AggregateLayer<Row>({
  scroll,
  renderAggregate,
  formatRange,
  formatBucketSize,
}: {
  scroll: GranumGridState<Row>;
  renderAggregate?(context: AggregateRenderContext): ReactNode;
  formatRange?(range: RowRange): string;
  formatBucketSize?(rows: number): string;
}) {
  const { session, snapshot, visibleRange, mapping } = scroll;
  const ready =
    session.aggregates[0]?.start === visibleRange.start &&
    session.aggregates.at(-1)?.end === visibleRange.end &&
    session.aggregates.length <= scroll.aggregateBuckets;
  if (!ready)
    return (
      <div className="ds-summary-status" role="status">
        {session.metadataErrors.aggregates
          ? 'Range summaries unavailable. Use Inspect rows to continue.'
          : 'Loading range summaries…'}
      </div>
    );
  return (
    <>
      {session.aggregates.map((bucket, index) => {
        const top = Math.max(0, mapping.toPixel(bucket.start));
        const bottom = Math.min(snapshot.height, mapping.toPixel(bucket.end));
        if (bottom - top < 48) return null;
        const label = formatRange?.(bucket) ?? bucket.label ?? rangeAddress(bucket);
        const address = rangeAddress(bucket);
        const rowsInGroup = bucket.end - bucket.start;
        const fillsView = bucket.start === visibleRange.start && bucket.end === visibleRange.end;
        const average = bucket.avg;
        const missing = bucket.accuracy === 'unavailable' || average == null;
        const unit = scroll.provider.metric?.unit;
        const metric = scroll.provider.metric?.label?.toLowerCase() ?? 'value';
        const spread =
          !missing && bucket.min != null && bucket.max != null && rowsInGroup > 1
            ? `${formatDecimal(bucket.min, 2)}–${formatDecimal(bucket.max, 2)}`
            : null;
        const accuracy =
          bucket.accuracy === 'estimated'
            ? {
                label: 'Estimated summary',
                title: 'This summary is not a total of every row in the group.',
              }
            : bucket.accuracy === 'exact'
              ? {
                  label: 'Exact summary',
                  title: 'This summary includes every row in the group.',
                }
              : {
                  label: 'Summary unavailable',
                  title: 'No summary is available for this group.',
                };
        const navigate = (inspect: boolean) => {
          if (inspect) scroll.controller.scrollToIndex(bucket.start, { align: 'start' });
          else scroll.controller.zoomToRange(bucket);
          // Summary controls can unmount during navigation. Keep keyboard input in the explorer.
          document.getElementById(`${scroll.id}-viewport`)?.focus({ preventScroll: true });
        };
        return (
          <div
            key={`${bucket.start}:${bucket.end}`}
            className="ds-summary-band"
            role="row"
            aria-rowindex={bucket.start + 1}
            data-ds-part="aggregate"
            data-range-start={bucket.start}
            data-range-end={bucket.end}
            style={{ top, height: bottom - top }}
          >
            <div className="ds-summary-content" role="gridcell">
              <div className="ds-summary-meta">
                <span>
                  Group {index + 1} of {session.aggregates.length}
                </span>
                <span>
                  {formatBucketSize && `${formatBucketSize(rowsInGroup)} · `}
                  {rangeCount(bucket)}
                </span>
                {label !== address && (
                  <span className="ds-summary-address" title="Where these rows sit in the dataset">
                    {address}
                  </span>
                )}
                <span className="ds-summary-accuracy" title={accuracy.title}>
                  {accuracy.label}
                </span>
              </div>
              <div className="ds-summary-heading">
                <strong title={label === address ? label : `${label} · ${address}`}>{label}</strong>
              </div>
              {renderAggregate ? (
                renderAggregate({ bucket, visibleRange, rowsPerPixel: snapshot.rowsPerPixel })
              ) : (
                <p className="ds-summary-metric">
                  <strong>
                    {missing
                      ? 'Unavailable'
                      : `${formatDecimal(average, 2)}${unit ? ` ${unit}` : ''}`}
                  </strong>
                  <span>{spread ? `Average ${metric} · ${spread}` : `Average ${metric}`}</span>
                </p>
              )}
              <div className="ds-summary-actions">
                <button
                  className="ds-button"
                  title={
                    rowsInGroup <= 1
                      ? 'This group is one row. Inspect rows to read it.'
                      : fillsView
                        ? 'This group already fills the view. Inspect rows to read the records.'
                        : 'Fill the view with this group and split it into smaller groups.'
                  }
                  disabled={rowsInGroup <= 1 || fillsView}
                  onClick={() => navigate(false)}
                >
                  Zoom into group
                </button>
                <button
                  className="ds-button"
                  aria-label="Inspect these rows"
                  title={`Read each record in this group, starting at row ${(bucket.start + 1).toLocaleString()}`}
                  onClick={() => navigate(true)}
                >
                  Inspect rows
                </button>
                <button
                  className="ds-button ds-summary-select"
                  title="Select every row in this group"
                  onClick={() => scroll.setSelection({ start: bucket.start, end: bucket.end })}
                >
                  Select this group
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
