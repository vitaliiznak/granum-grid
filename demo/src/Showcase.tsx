import type { DeepScrollEngine, ScrollStats } from 'deepscroll';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { datasets, type DemoDataset, type TourContext } from './datasets';
import { compact, formatCount } from './datasets/types';
import { models } from './data/models';

const sparklines = new Map<string, string>();
function sparkline(id: string) {
  if (sparklines.has(id)) return sparklines.get(id)!;
  const model = models[id];
  const points = Array.from({ length: 96 }, (_, i) =>
    model.value(Math.floor((i / 95) * (model.rowCount - 1))),
  );
  const values = points.filter((v): v is number => v !== null);
  const min = Math.min(...values),
    max = Math.max(...values);
  let previous = 0.5;
  const path = points
    .map((v, i) => {
      if (v !== null) previous = (v - min) / (max - min || 1);
      return `${i ? 'L' : 'M'}${((i / 95) * 120).toFixed(1)} ${(30 - previous * 26).toFixed(1)}`;
    })
    .join(' ');
  sparklines.set(id, path);
  return path;
}
function Sparkline({ id }: { id: string }) {
  const path = useMemo(() => sparkline(id), [id]);
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

export function DatasetGallery({ value, onChange }: { value: string; onChange(id: string): void }) {
  return (
    <nav className="dataset-gallery" aria-label="Datasets">
      {datasets.map((dataset) => (
        <button
          key={dataset.id}
          className={`dataset-card dataset-${dataset.id}`}
          aria-pressed={dataset.id === value}
          onClick={() => onChange(dataset.id)}
        >
          <span className="dataset-card-icon">{dataset.icon}</span>
          <span className="dataset-card-text">
            <strong>{dataset.name}</strong>
            <span>
              {compact(dataset.provider.rowCount)} {dataset.unit}
            </span>
          </span>
          <Sparkline id={dataset.id} />
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
          <small>{dataset.facts.slice(1).join(' · ')}</small>
        </div>
        <div>
          <dt>If fully loaded</dt>
          <dd>≈ {bytes(total * dataset.bytesPerRow)}</dd>
        </div>
        <div className="scale-live">
          <dt>In memory now</dt>
          <dd>{formatCount(cached)}</dd>
          <small>{cached ? `${((cached / total) * 100).toPrecision(2)}% of rows` : 'rows'}</small>
        </div>
      </dl>
    </section>
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Type into the explorer's own jump bar, so the tour shows the real search UI. */
async function typeIntoJumpBar(root: HTMLElement, text: string, signal: { cancelled: boolean }) {
  root.querySelector<HTMLButtonElement>('.ds-jump-trigger')?.click();
  const input = root.querySelector<HTMLInputElement>(
    'input[aria-label="Go to row, date, or event"]',
  );
  if (!input) return;
  for (let i = 0; i < 20 && !input.closest('dialog')?.open; i++) await wait(25);
  await wait(60);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (let i = instant ? text.length : 1; i <= text.length; i++) {
    if (signal.cancelled || !input.closest('dialog')?.open) return;
    setValue.call(input, text.slice(0, i));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(34);
  }
}
export function FeatureTour({
  dataset,
  controller,
  explorer,
  children,
}: {
  dataset: DemoDataset;
  controller: RefObject<DeepScrollEngine | null>;
  explorer(): HTMLElement | null;
  /** Explorer options shown beside the hint. */
  children?: ReactNode;
}) {
  const [active, setActive] = useState<number | null>(null);
  const typing = useRef({ cancelled: false });
  useEffect(() => {
    setActive(null);
    return () => {
      typing.current.cancelled = true;
    };
  }, [dataset.id]);
  const run = (i: number) => {
    const engine = controller.current,
      root = explorer();
    if (!engine || !root) return;
    typing.current.cancelled = true;
    typing.current = { cancelled: false };
    const signal = typing.current;
    const tour: TourContext = {
      controller: engine,
      search: (text) => typeIntoJumpBar(root, text, signal),
      fit: () => {
        engine.setView('zoom');
        const snapshot = engine.getSnapshot();
        engine.setZoom(snapshot.rowCount / snapshot.height);
        engine.goTo(Math.round(Math.max(0, snapshot.rowCount - 1) / 2), { motion: 'instant' });
      },
    };
    setActive(i);
    void dataset.tour[i].run(tour);
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
            onClick={() => run(i)}
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
              <b>Tip</b>
              {dataset.help}
            </>
          )}
        </p>
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
      {shortcuts.map(([keys, label]) => (
        <span key={label}>
          <kbd>{keys}</kbd> {label}
        </span>
      ))}
    </p>
  );
}
