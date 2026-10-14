import type { Bucket } from '../data/types.js';
import { formatCompactTick, formatDecimal } from '../visuals/format.js';

/** A zero-based bar and optional min–max whisker, on the same scale for every group. */
export function AggregatePlot({
  bucket,
  domain,
  metric,
  unit,
}: {
  bucket: Bucket;
  domain: readonly [number, number];
  metric: string;
  unit?: string;
}) {
  const missing = bucket.accuracy === 'unavailable' || bucket.avg === null;
  const [low, high] = domain;
  // Normalize first to avoid overflow for large finite provider values.
  const magnitude = Math.max(Math.abs(low), Math.abs(high), 1);
  const position = (value: number) =>
    2 + ((value / magnitude - low / magnitude) / (high / magnitude - low / magnitude)) * 96;
  const zero = position(0);
  const average = missing ? zero : position(bucket.avg!);
  const spread = !missing && bucket.min !== null && bucket.max !== null;
  const value = (n: number) => `${formatDecimal(n, 2)}${unit ? ` ${unit}` : ''}`;
  const description = missing
    ? `${metric} unavailable`
    : `Average ${metric.toLowerCase()}: ${value(bucket.avg!)}${
        spread ? `. Minimum ${value(bucket.min!)}; maximum ${value(bucket.max!)}` : ''
      }. ${bucket.accuracy === 'estimated' ? 'Estimated' : 'Exact'} summary.`;
  return (
    <div className="ds-summary-plot" data-accuracy={bucket.accuracy}>
      <div className="ds-summary-metric">
        <span>Average {metric.toLowerCase()}</span>
        <strong>{missing ? 'Unavailable' : value(bucket.avg!)}</strong>
      </div>
      <svg role="img" aria-label={description} width="100%" height="32">
        <title>{description}</title>
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            className="ds-summary-gridline"
            x1={`${2 + fraction * 96}%`}
            x2={`${2 + fraction * 96}%`}
            y1="0"
            y2="32"
          />
        ))}
        <line className="ds-summary-zero" x1={`${zero}%`} x2={`${zero}%`} y1="0" y2="32" />
        {!missing && (
          <>
            <rect
              className="ds-summary-bar"
              x={`${Math.min(zero, average)}%`}
              y="8"
              width={`${Math.abs(average - zero)}%`}
              height="16"
              rx="2"
            />
            {spread && (
              <>
                <line
                  className="ds-summary-spread"
                  x1={`${position(bucket.min!)}%`}
                  x2={`${position(bucket.max!)}%`}
                  y1="16"
                  y2="16"
                />
                {[bucket.min!, bucket.max!].map((edge, i) => (
                  <line
                    key={i}
                    className="ds-summary-spread"
                    x1={`${position(edge)}%`}
                    x2={`${position(edge)}%`}
                    y1="11"
                    y2="21"
                  />
                ))}
              </>
            )}
            <line
              className="ds-summary-average"
              x1={`${average}%`}
              x2={`${average}%`}
              y1="6"
              y2="26"
            />
          </>
        )}
      </svg>
      <div className="ds-summary-axis" aria-hidden="true">
        {[low, low / 2 + high / 2, high].map((tick, i) => (
          <span key={i}>{formatCompactTick(tick)}</span>
        ))}
      </div>
    </div>
  );
}
