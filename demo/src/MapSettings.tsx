import type { AtlasRailOptions } from 'deepscroll';
import { useEffect, useRef } from 'react';

export function MapSettings({
  value,
  onChange,
  labels,
  chapters,
}: {
  value: AtlasRailOptions;
  onChange(value: AtlasRailOptions): void;
  labels: { profile: string; tracks: string; explain: string; sampling: string };
  /** Name of the dataset's chapters, such as Years or Chromosomes. */
  chapters: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (details.current?.open && !details.current.contains(event.target as Node))
        details.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.current?.open) {
        details.current.open = false;
        details.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return (
    <details ref={details} className="map-settings">
      <summary>
        Map settings <span aria-hidden="true">⌄</span>
      </summary>
      <div className="map-settings-panel">
        <strong>Dataset map</strong>
        <p>Choose what the map shows.</p>
        <label>
          Display
          <select
            aria-label="Map display"
            value={value.variant ?? 'profile'}
            onChange={(e) =>
              onChange({ ...value, variant: e.target.value as AtlasRailOptions['variant'] })
            }
          >
            <option value="profile">{labels.profile}</option>
            <option value="markers">Events only</option>
          </select>
        </label>
        <label>
          Vertical axis
          <select
            aria-label="Map vertical axis"
            value={value.axis ?? 'chapters'}
            onChange={(e) =>
              onChange({ ...value, axis: e.target.value as AtlasRailOptions['axis'] })
            }
          >
            <option value="chapters">{chapters}</option>
            <option value="rows">Row numbers</option>
          </select>
        </label>
        <label>
          Event labels
          <select
            aria-label="Map event labels"
            value={value.markerLabels ?? 'label'}
            onChange={(e) =>
              onChange({
                ...value,
                markerLabels: e.target.value as AtlasRailOptions['markerLabels'],
              })
            }
          >
            <option value="label">Names</option>
            <option value="number">Numbers</option>
            <option value="none">Symbols only</option>
          </select>
        </label>
        <label>
          Width
          <select
            aria-label="Map width"
            value={value.layout ?? 'auto'}
            onChange={(e) =>
              onChange({ ...value, layout: e.target.value as AtlasRailOptions['layout'] })
            }
          >
            <option value="auto">Automatic</option>
            <option value="compact">Compact</option>
          </select>
        </label>
        <label className="map-range-option">
          <input
            type="checkbox"
            checked={value.showTracks ?? false}
            onChange={(e) => onChange({ ...value, showTracks: e.target.checked })}
          />
          {labels.tracks}
        </label>
        <label className="map-range-option">
          <input
            type="checkbox"
            checked={value.showRange ?? false}
            disabled={value.variant === 'markers'}
            onChange={(e) => onChange({ ...value, showRange: e.target.checked })}
          />
          Show sampled min–max range
        </label>
        <p>{labels.explain}</p>
        <p className="map-sampling-note">{labels.sampling}</p>
        <button
          type="button"
          onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
        >
          Done
        </button>
      </div>
    </details>
  );
}
