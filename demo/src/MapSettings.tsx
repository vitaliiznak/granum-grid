import type { AtlasRailOptions } from 'granum-grid';
import { useEffect, useId, useRef, useState } from 'react';

export function MapSettings({
  value,
  onChange,
  onReset,
  labels,
}: {
  value: AtlasRailOptions;
  /** Only changed options, so dataset defaults stay with their dataset. */
  onChange(patch: AtlasRailOptions): void;
  onReset(): void;
  /** `chapters` names the dataset's chapters, such as Years or Chromosomes. */
  labels: { chapters: string; profile: string; tracks: string; explain: string; sampling: string };
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const positionPanel = () => {
    if (!trigger.current || !panel.current) return;
    const rect = trigger.current.getBoundingClientRect();
    // Open above the button when there is more room there; never cover the trigger.
    const below = window.innerHeight - rect.bottom - 24;
    const above = rect.top - 24;
    const opensBelow = below >= 320 || below >= above;
    const top = opensBelow ? rect.bottom + 8 : Math.max(16, rect.top - 688);
    const height = opensBelow ? below : rect.top - top - 8;
    const right = Math.max(16, window.innerWidth - rect.right);
    panel.current.style.setProperty('--map-settings-top', `${top}px`);
    panel.current.style.setProperty('--map-settings-right', `${right}px`);
    panel.current.style.setProperty('--map-settings-height', `${Math.max(0, height)}px`);
  };
  const close = () => {
    panel.current?.hidePopover();
    trigger.current?.focus();
  };
  useEffect(() => {
    const reposition = () => {
      if (panel.current?.matches(':popover-open')) positionPanel();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, []);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="map-settings-trigger"
        aria-label="Scrollbar settings"
        aria-expanded={open}
        title="Scrollbar settings"
        popoverTarget={panelId}
        onClick={positionPanel}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 7h3m4 0h9M4 17h9m4 0h3" />
          <circle cx="9" cy="7" r="2" />
          <circle cx="15" cy="17" r="2" />
        </svg>
      </button>
      <div
        ref={panel}
        id={panelId}
        popover="auto"
        onToggle={(event) => setOpen(event.newState === 'open')}
        role="dialog"
        aria-labelledby={`${panelId}-title`}
        className="map-settings-panel"
      >
        <strong id={`${panelId}-title`}>Scrollbar settings</strong>
        <p>Changes apply now and stay with this dataset while you explore.</p>
        <fieldset className="map-settings-group">
          <legend>Layout</legend>
          <label>
            Display
            <select
              aria-label="Scrollbar display"
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
              aria-label="Scrollbar vertical axis"
              value={value.axis ?? 'chapters'}
              onChange={(e) => onChange({ axis: e.target.value as AtlasRailOptions['axis'] })}
            >
              <option value="chapters">{labels.chapters}</option>
              <option value="rows">Row numbers</option>
            </select>
          </label>
          <label>
            Axis labels
            <select
              aria-label="Scrollbar axis labels"
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
              aria-label="Scrollbar width"
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
              aria-label="Scrollbar event labels"
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
              ['showLegend', 'Show legend', true],
            ] as const
          ).map(([key, label, fallback]) => (
            <label className="map-range-option" key={key}>
              <input
                type="checkbox"
                checked={value[key] ?? fallback}
                disabled={
                  (key === 'showRange' || key === 'showTracks') && value.variant === 'markers'
                }
                onChange={(e) => onChange({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
          {value.showTracks && value.variant !== 'markers' && (
            <p>Choose one chart at a time above the scrollbar in expanded width.</p>
          )}
        </fieldset>
        <fieldset className="map-settings-group">
          <legend>Hover & navigation</legend>
          <label>
            Hover details
            <select
              aria-label="Scrollbar hover details"
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
              aria-label="Scrollbar preview rows"
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
              checked={value.showMagnifier ?? false}
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
          <label className="map-range-option">
            <input
              type="checkbox"
              checked={value.snapToPeaks ?? true}
              disabled={value.variant === 'markers'}
              onChange={(e) => onChange({ snapToPeaks: e.target.checked })}
            />
            Attract pointer to chart peaks
          </label>
        </fieldset>
        <p>{labels.explain}</p>
        <p className="map-sampling-note">{labels.sampling}</p>
        <div className="map-settings-actions">
          <button type="button" onClick={onReset}>
            Reset scrollbar
          </button>
          <button type="button" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
