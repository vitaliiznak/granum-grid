import { memo } from 'react';
import type { View } from '../core/engine.js';

export const viewLabels: Record<View, string> = {
  rows: 'Rows',
  lens: 'Focused rows',
  zoom: 'Range summaries',
};

/** Illustrations explain the layout only; they do not represent provider data. */
function ViewDiagram({ view }: { view: View }) {
  return (
    <svg className="ds-view-diagram" viewBox="0 0 96 64" aria-hidden="true">
      {view === 'rows' ? (
        [8, 18, 28, 38, 48].map((y) => (
          <rect
            key={y}
            x="8"
            y={y}
            width="80"
            height="7"
            rx="2"
            fill="currentColor"
            opacity=".35"
          />
        ))
      ) : view === 'lens' ? (
        <>
          {[4, 7, 10, 13, 49, 52, 55, 58].map((y) => (
            <path key={y} d={`M8 ${y}h80`} stroke="currentColor" opacity=".35" />
          ))}
          {[19, 29, 39].map((y) => (
            <rect
              key={y}
              x="8"
              y={y}
              width="80"
              height="7"
              rx="2"
              fill="currentColor"
              opacity={y === 29 ? '.9' : '.5'}
            />
          ))}
        </>
      ) : (
        [5, 24, 43].map((y, index) => (
          <g key={y}>
            <rect x="8" y={y} width="80" height="16" rx="3" fill="currentColor" opacity=".12" />
            <path d={`M14 ${y + 5}h28`} stroke="currentColor" opacity=".6" />
            <rect
              x="14"
              y={y + 9}
              width={[36, 62, 45][index]}
              height="3"
              rx="1"
              fill="currentColor"
              opacity=".6"
            />
          </g>
        ))
      )}
    </svg>
  );
}

const explanations: Record<View, string> = {
  rows: 'Read one record per line. Best for checking individual values.',
  lens: 'Keep nearby rows readable in the middle. The rest is compressed above and below; click there to move your focus.',
  zoom: 'Each band summarizes a group of rows. Zoom in to narrow the range, then use Inspect rows to read individual records.',
};

const descriptions: Record<View, string> = {
  rows: 'Read individual records, one per line.',
  lens: 'Nearby rows stay readable; the rest is compressed above and below.',
  zoom: 'See patterns in grouped rows. Zoom in, then inspect individual records.',
};

export const ViewGuide = memo(function ViewGuide({
  view,
  detailed,
  descriptionId,
}: {
  view: View;
  detailed: boolean;
  descriptionId: string;
}) {
  return (
    <details className="ds-view-guide">
      <summary>
        <span id={descriptionId}>
          <strong>{viewLabels[view]}</strong>{' '}
          {view === 'zoom' && detailed
            ? 'Individual rows at this scale. Zoom out to see grouped summaries.'
            : descriptions[view]}
        </span>
        <span className="ds-view-guide-toggle">Compare views</span>
      </summary>
      <div className="ds-view-guide-content">
        <div className="ds-view-guide-options">
          {(['rows', 'lens', 'zoom'] as const).map((mode) => (
            <div
              key={mode}
              className="ds-view-guide-option"
              data-current={mode === view || undefined}
            >
              <ViewDiagram view={mode} />
              <div>
                <strong>
                  {viewLabels[mode]}
                  {mode === view && ' · current'}
                </strong>
                <p>{explanations[mode]}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="ds-view-guide-map">
          The dataset map on the right always shows the whole dataset. These views change the main
          reading area.
        </p>
      </div>
    </details>
  );
});
