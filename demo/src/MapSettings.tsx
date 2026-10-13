import type { AtlasRailOptions } from 'deepscroll';
import { useEffect, useRef } from 'react';

export function MapSettings({
  value,
  onChange,
  onReset,
  labels,
  chapters,
}: {
  value: AtlasRailOptions;
  /** Only changed options, so dataset defaults stay with their dataset. */
  onChange(patch: AtlasRailOptions): void;
  onReset(): void;
  labels: { profile: string; tracks: string; explain: string; sampling: string };
  /** Name of the dataset's chapters, such as Years or Chromosomes. */
  chapters: string;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const close = () => {
    if (!details.current) return;
    details.current.open = false;
    details.current.querySelector('summary')?.focus();
  };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (details.current?.open && !details.current.contains(event.target as Node))
        details.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && details.current?.open) close();
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
        <p>Changes apply now and stay with this dataset while you explore.</p>
        <fieldset className="map-settings-group">
          <legend>Layout</legend>
          <label>
            Display
            <select
              aria-label="Map display"
              value={value.variant ?? 'profile'}
              onChange={(e) => onChange({ variant: e.target.value as AtlasRailOptions['variant'] })}
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
              onChange={(e) => onChange({ axis: e.target.value as AtlasRailOptions['axis'] })}
            >
              <option value="chapters">{chapters}</option>
              <option value="rows">Row numbers</option>
            </select>
          </label>
          <label>
            Axis labels
            <select
              aria-label="Map axis labels"
              value={value.maxAxisTicks ?? 5}
              onChange={(e) => onChange({ maxAxisTicks: +e.target.value })}
            >
              <option value={3}>Sparse · up to 3</option>
              <option value={5}>Standard · up to 5</option>
              <option value={10}>Detailed · up to 10</option>
            </select>
          </label>
          <label>
            Width
            <select
              aria-label="Map width"
              value={value.layout ?? 'auto'}
              onChange={(e) => onChange({ layout: e.target.value as AtlasRailOptions['layout'] })}
            >
              <option value="auto">Automatic</option>
              <option value="expanded">Expanded</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </fieldset>
        <fieldset className="map-settings-group">
          <legend>Layers</legend>
          <label>
            Event labels
            <select
              aria-label="Map event labels"
              value={value.markerLabels ?? 'label'}
              disabled={value.showMarkers === false}
              onChange={(e) =>
                onChange({ markerLabels: e.target.value as AtlasRailOptions['markerLabels'] })
              }
            >
              <option value="label">Names</option>
              <option value="number">Numbers</option>
              <option value="none">Symbols only</option>
            </select>
          </label>
          {(
            [
              ['showMarkers', 'Show event markers', true],
              ['showTracks', labels.tracks, false],
              ['showRange', 'Show sampled min–max range', false],
              ['showVisibleRange', 'Show visible row range', true],
              ['showTrail', 'Show visited trail', true],
              ['showLegend', 'Show map legend', true],
            ] as const
          ).map(([key, label, fallback]) => (
            <label className="map-range-option" key={key}>
              <input
                type="checkbox"
                checked={value[key] ?? fallback}
                disabled={key === 'showRange' && value.variant === 'markers'}
                onChange={(e) => onChange({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="map-settings-group">
          <legend>Hover & navigation</legend>
          <label>
            Hover details
            <select
              aria-label="Map hover details"
              value={value.preview ?? 'rows'}
              onChange={(e) => onChange({ preview: e.target.value as AtlasRailOptions['preview'] })}
            >
              <option value="rows">Summary + rows</option>
              <option value="summary">Summary only</option>
              <option value="none">Off</option>
            </select>
          </label>
          <label>
            Preview rows
            <select
              aria-label="Map preview rows"
              value={value.previewRows ?? 3}
              disabled={value.preview === 'summary' || value.preview === 'none'}
              onChange={(e) => onChange({ previewRows: +e.target.value })}
            >
              <option value={1}>1 row</option>
              <option value={3}>3 rows</option>
              <option value={5}>5 rows</option>
            </select>
          </label>
          <label className="map-range-option">
            <input
              type="checkbox"
              checked={value.showMagnifier ?? true}
              disabled={value.preview === 'none' || value.variant === 'markers'}
              onChange={(e) => onChange({ showMagnifier: e.target.checked })}
            />
            Show hover magnifier
          </label>
          <label className="map-range-option">
            <input
              type="checkbox"
              checked={value.snapToMarkers ?? true}
              disabled={value.showMarkers === false}
              onChange={(e) => onChange({ snapToMarkers: e.target.checked })}
            />
            Snap to events while dragging
          </label>
        </fieldset>
        <p>{labels.explain}</p>
        <p className="map-sampling-note">{labels.sampling}</p>
        <div className="map-settings-actions">
          <button type="button" onClick={onReset}>
            Reset map
          </button>
          <button type="button" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </details>
  );
}
