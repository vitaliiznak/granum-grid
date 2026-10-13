import { useEffect, useState } from 'react';
import type { Bucket, DataProvider, RowRange } from '../data/types.js';
import { checkBuckets } from '../data/bounds.js';
import { formatDecimal, rangeAddress, rangeCount } from '../visuals/format.js';

/** Exact or estimated statistics for one range, loaded from the provider's aggregates. */
function useSummary<Row>(provider: DataProvider<Row>, range: RowRange | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ bucket?: Bucket; message: string; retryable?: boolean }>({
    message: 'Select a range',
  });
  // Depend on the bounds, not the object, so an equal range does not refetch.
  const start = range?.start,
    end = range?.end;
  useEffect(() => {
    if (start === undefined || end === undefined) {
      setState({ message: 'Select a range' });
      return;
    }
    if (!provider.fetchAggregates) {
      setState({ message: 'This provider does not supply range summaries.' });
      return;
    }
    const span = { start, end };
    const controller = new AbortController();
    setState({ message: 'Loading summary…' });
    const deadline = setTimeout(() => {
      controller.abort();
      setState({ message: 'Summary timed out.', retryable: true });
    }, 15_000);
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => provider.fetchAggregates!({ ...span, buckets: 1 }, controller.signal))
        .then((buckets) => {
          if (controller.signal.aborted) return;
          // Exactly one bucket covering the selected range; anything else throws.
          const [b] = checkBuckets(buckets, { ...span, buckets: 1 });
          setState({
            bucket: b,
            message:
              b.accuracy === 'exact'
                ? 'Exact summary'
                : b.accuracy === 'estimated'
                  ? 'Estimated summary'
                  : 'Summary unavailable',
          });
        })
        .catch((error) => {
          if (!controller.signal.aborted) setState({ message: String(error), retryable: true });
        })
        .finally(() => clearTimeout(deadline));
    }, 150);
    return () => {
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [provider, start, end, attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}
export function RangeSummary<Row>({
  provider,
  range,
  showRange = true,
}: {
  provider: DataProvider<Row>;
  range: RowRange;
  showRange?: boolean;
}) {
  const { bucket, message, retryable, retry } = useSummary(provider, range);
  const single = range.end - range.start === 1;
  const format = (value: number | null | undefined) =>
    value == null
      ? 'Unavailable'
      : `${formatDecimal(value, 2)}${provider.metric?.unit ? ` ${provider.metric.unit}` : ''}`;
  return (
    <div className="ds-range-summary">
      {showRange && (
        <p>
          {rangeAddress(range)} · {rangeCount(range)}
        </p>
      )}
      <div className="ds-summary-heading">
        <strong>{provider.metric?.label ?? 'Range statistics'}</strong>
        <span className="ds-summary-quality" role="status">
          {message}
        </span>
      </div>
      {retryable && (
        <button className="ds-button" onClick={retry}>
          Retry summary
        </button>
      )}
      {bucket && bucket.accuracy !== 'unavailable' && (
        <dl>
          <div>
            <dt>{single ? 'Value' : 'Average'}</dt>
            <dd>{format(bucket.avg)}</dd>
          </div>
          {!single && (
            <>
              <div>
                <dt>Lowest</dt>
                <dd>{format(bucket.min)}</dd>
              </div>
              <div>
                <dt>Highest</dt>
                <dd>{format(bucket.max)}</dd>
              </div>
            </>
          )}
        </dl>
      )}
      {bucket?.accuracy === 'estimated' && (
        <p className="ds-summary-note">Based on a sample of the selected rows.</p>
      )}
    </div>
  );
}
