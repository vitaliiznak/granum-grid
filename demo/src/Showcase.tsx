import type { GranumGridApi, ScrollStats } from 'granum-grid';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { datasets, type DemoDataset, type TourContext } from './datasets';
import { compact, formatCount, showAll } from './datasets/types';
import { models } from './data/models';

const sparklines = new Map<string, string>();
function sparkline(id: string, profileValues?: (number | null)[]) {
  if (!profileValues && sparklines.has(id)) return sparklines.get(id)!;
  const model = models[id];
  if (!model && !profileValues) return '';
  const points =
    profileValues ??
    Array.from({ length: 96 }, (_, i) => model.value(Math.floor((i / 95) * (model.rowCount - 1))));
  const values = points.filter((v): v is number => v !== null);
  const min = Math.min(...values),
    max = Math.max(...values);
  let previous = 0.5;
  const path = points
    .map((v, i) => {
      if (v !== null) previous = (v - min) / (max - min || 1);
      return `${i ? 'L' : 'M'}${((i / Math.max(1, points.length - 1)) * 120).toFixed(1)} ${(30 - previous * 26).toFixed(1)}`;
    })
    .join(' ');
  if (!profileValues) sparklines.set(id, path);
  return path;
}
function Sparkline({ id, values }: { id: string; values?: (number | null)[] }) {
  const path = useMemo(() => sparkline(id, values), [id, values]);
  if (!path) return null;
  return (
    <svg
      className="dataset-spark"
      viewBox="0 0 120 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={`${path} L120 32 L0 32 Z`} className="dataset-spark-area" />
      <path d={path} className="dataset-spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function DatasetGallery({
  current,
  onChange,
}: {
  /** The selected dataset, which may be an imported recording rather than the default. */
  current: DemoDataset;
  onChange(id: string): void;
}) {
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    // On narrow screens the gallery scrolls sideways; keep the chosen card in view.
    const card = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (strip.current && card && strip.current.scrollWidth > strip.current.clientWidth)
      strip.current.scrollTo({ left: card.offsetLeft - strip.current.offsetLeft - 16 });
  }, [current.id]);
  return (
    <nav ref={strip} className="dataset-gallery" aria-label="Datasets">
      {datasets.map((item) => {
        const dataset = item.id === current.id ? current : item;
        return (
          <button
            key={dataset.id}
            className={`dataset-card dataset-${dataset.id}`}
            aria-pressed={dataset.id === current.id}
            onClick={() => onChange(dataset.id)}
          >
            <span className="dataset-card-icon">{dataset.icon}</span>
            <span className="dataset-card-text">
              <strong>{dataset.name}</strong>
              <span>
                {compact(dataset.provider.rowCount)} {dataset.unit}
              </span>
            </span>
            <Sparkline id={dataset.id} values={dataset.profileValues} />
          </button>
        );
      })}
    </nav>
  );
}

export function DatasetSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange(id: string): void;
}) {
  return (
    <nav className="dataset-switcher" aria-label="Datasets">
      {datasets.map((dataset) => (
        <button
          key={dataset.id}
          type="button"
          className={`dataset-switcher-button dataset-${dataset.id}`}
          aria-label={dataset.name}
          title={dataset.name}
          aria-pressed={dataset.id === value}
          onClick={() => onChange(dataset.id)}
        >
          {dataset.icon}
        </button>
      ))}
    </nav>
  );
}

const bytes = (value: number) =>
  value >= 1e12
    ? `${(value / 1e12).toFixed(1)} TB`
    : value >= 1e9
      ? `${Math.round(value / 1e9)} GB`
      : `${Math.round(value / 1e6)} MB`;
export function DatasetIntro({
  dataset,
  stats,
}: {
  dataset: DemoDataset;
  stats: ScrollStats | null;
}) {
  const total = dataset.provider.rowCount,
    cached = stats?.cachedRows ?? 0;
  return (
    <section className={`intro dataset-${dataset.id}`}>
      <div className="intro-text">
        <h1>{dataset.title}</h1>
        <p className="intro-description">{dataset.description}</p>
      </div>
      <dl className="scale-stats">
        <div>
          <dt>Navigable {dataset.unit}</dt>
          <dd>{compact(total)}</dd>
          <small>{dataset.facts.join(' · ')}</small>
        </div>
        <div>
          <dt>{dataset.sourceNote ? 'Source' : 'If fully loaded'}</dt>
          <dd>
            {dataset.sourceNote
              ? (dataset.sourceLabel ?? 'Browser trace')
              : `≈ ${bytes(total * dataset.bytesPerRow)}`}
          </dd>
        </div>
        <div className="scale-live">
          <dt>{dataset.sourceNote ? 'Explorer cache' : 'In memory now'}</dt>
          <dd>{formatCount(cached)}</dd>
          <small>{cached ? `${((cached / total) * 100).toPrecision(2)}% of rows` : 'rows'}</small>
        </div>
      </dl>
      {dataset.sourceNote && <p className="source-note">{dataset.sourceNote}</p>}
    </section>
  );
}

export function FeatureTour({
  dataset,
  api,
  children,
}: {
  dataset: DemoDataset;
  api: RefObject<GranumGridApi<unknown> | null>;
  /** Explorer options shown beside the hint. */
  children?: ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    setActive(null);
  }, [dataset.id]);
  const run = (i: number) => {
    const mounted = api.current;
    if (!mounted) return;
    const engine = mounted.controller;
    const step = dataset.tour[i];
    const origin = engine.getLocation();
    setActive(i);
    if (step.requiredView && engine.getSnapshot().view !== step.requiredView) {
      engine.setView(step.requiredView);
    }
    const tour: TourContext = {
      controller: engine,
      search: (text) => mounted.openSearch(text),
      fit: () => {
        engine.restore(origin);
        showAll(engine);
      },
    };
    void step.run?.(tour);
  };
  const step = active === null ? null : dataset.tour[active];
  return (
    <div className={`feature-tour dataset-${dataset.id}`}>
      <div className="tour-steps" role="group" aria-label="Feature tour">
        <span className="tour-label">Try it</span>
        {dataset.tour.map((s, i) => (
          <button
            key={s.label}
            className="tour-step"
            data-active={i === active || undefined}
            onClick={(event) => {
              event.currentTarget.focus();
              run(i);
            }}
          >
            <small>{s.feature}</small>
            {s.label}
          </button>
        ))}
      </div>
      <div className="tour-footer">
        <p className="tour-hint" aria-live="polite">
          {step ? (
            <>
              <b>{step.feature}</b>
              {step.hint}
            </>
          ) : (
            <>
              <b>Start here</b>
              {dataset.task.title}
            </>
          )}
        </p>
        <button
          className="task-start"
          onClick={() => {
            if (api.current) dataset.task.run(api.current.controller);
          }}
        >
          {dataset.task.action} →
        </button>
        {children && <div className="explorer-options">{children}</div>}
      </div>
    </div>
  );
}

const shortcuts = [
  ['↑ ↓', 'row'],
  ['PgUp PgDn', 'page'],
  ['⌘/Ctrl ↑ ↓', 'chapter'],
  ['N P', 'marker'],
  ['/', 'search'],
  ['Alt ← →', 'history'],
  ['Home End', 'ends'],
];
export function ShortcutStrip() {
  return (
    <p className="shortcut-strip" aria-label="Keyboard shortcuts">
      <span>Click the table to focus it, then use these shortcuts:</span>
      {shortcuts.map(([keys, label]) => (
        <span key={label}>
          <kbd>{keys}</kbd> {label}
        </span>
      ))}
    </p>
  );
}
