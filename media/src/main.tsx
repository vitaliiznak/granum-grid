import { createRoot } from 'react-dom/client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DeepScroll, type DeepScrollEngine, type ScrollStats } from 'deepscroll';
import { findDataset } from '../../demo/src/datasets';
import { compact } from '../../demo/src/datasets/types';
import { setLatency } from '../../demo/src/data/provider';
import { scenes, type Scene } from './scenes';
import 'deepscroll/styles.css';
import '../../demo/src/styles.css';
import './studio.css';

// This bridge belongs only to the studio. Captures exercise the public controller.
declare global {
  interface Window {
    __deepscrollMedia?: {
      scenes: Scene[];
      select(id: string): void;
      controller: DeepScrollEngine | null;
      fit(): void;
    };
  }
}
setLatency(80);
const params = new URLSearchParams(location.search);
const capture = params.get('capture') === '1';

function Studio() {
  const [scene, setScene] = useState(
    () => scenes.find((item) => item.id === params.get('scene')) ?? scenes[0],
  );
  const [take, setTake] = useState(0);
  const [scale, setScale] = useState(1);
  const [stats, setStats] = useState<ScrollStats | null>(null);
  const [expanded, setExpanded] = useState(new Set<number>());
  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<DeepScrollEngine>(null);
  const dataset = findDataset(scene.dataset);
  const dynamic = scene.action === 'expand';
  const theme = scene.theme ?? 'light';
  const select = (id: string) => {
    const next = scenes.find((item) => item.id === id);
    if (!next) throw new Error(`Unknown media scene: ${id}`);
    setStats(null);
    setExpanded(new Set());
    setScene(next);
    setTake((value) => value + 1);
    const query = new URLSearchParams(location.search);
    query.set('scene', next.id);
    history.replaceState(null, '', `?${query}`);
  };
  const fit = () => {
    const engine = controller.current;
    if (!engine) return;
    engine.setView('zoom');
    const { rowCount, height } = engine.getSnapshot();
    engine.setZoom(rowCount / height);
    engine.goTo(Math.floor((rowCount - 1) / 2), { motion: 'instant' });
  };
  useLayoutEffect(() => {
    const element = container.current!;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(entry.contentRect.width / 1440, entry.contentRect.height / 810));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.__deepscrollMedia = { scenes, select, controller: controller.current, fit };
    return () => {
      delete window.__deepscrollMedia;
    };
  }, [scene, take, theme]);
  const playAction = () => {
    if (scene.action === 'overview') fit();
    else if (scene.action === 'lens') controller.current?.setView('lens');
    else if (scene.action === 'jump') controller.current?.goTo(scene.target!);
    else if (scene.action === 'expand') setExpanded(new Set([scene.index!]));
    else if (scene.action === 'search')
      document.querySelector<HTMLButtonElement>('.ds-jump-trigger')?.click();
    else if (scene.action === 'compare')
      document.querySelector<HTMLButtonElement>('.ds-explore-toggle button')?.click();
    else controller.current?.pan(dataset.rowHeight * 5);
  };
  return (
    <main className={`studio ${capture ? 'is-capture' : ''}`}>
      {!capture && (
        <aside className="director">
          <div className="studio-brand">
            deepscroll <span>/ media studio</span>
          </div>
          <p>Real components. Repeatable captures.</p>
          <nav aria-label="Media scenes">
            {scenes.map((item, index) => (
              <button
                key={item.id}
                aria-pressed={scene.id === item.id}
                onClick={() => select(item.id)}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                {item.label}
                <small>{item.seconds}s</small>
              </button>
            ))}
          </nav>
          <button className="director-action" onClick={playAction}>
            Try this scene →
          </button>
          <button className="director-reset" onClick={() => select(scene.id)}>
            Reset scene
          </button>
          <p className="director-note">
            The table is interactive. Edit copy and timings in <code>media/src/scenes.ts</code>.
          </p>
          <p className="director-note">
            Export from the terminal:
            <br />
            <code>npm run media:screenshots</code>
            <br />
            <code>npm run media:video</code>
          </p>
        </aside>
      )}
      <div className="preview" ref={container}>
        <article
          className={`stage dataset-${scene.dataset}`}
          data-scene={scene.id}
          data-ready={Boolean(stats?.cachedRows && stats.activeRequests === 0)}
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <header className="stage-top">
            <span className="stage-wordmark">
              <span className="brand-glyph" aria-hidden="true">
                ≋
              </span>{' '}
              deepscroll
            </span>
            <span className="stage-edition">
              REACT + TYPESCRIPT <i /> DATA EXPLORER
            </span>
          </header>
          <section className="story">
            <div>
              <p className="eyebrow">{scene.label}</p>
              <h1>{scene.title}</h1>
            </div>
            <div className="story-aside">
              <p>{scene.description}</p>
              <span>
                {compact(dataset.provider.rowCount)} {dataset.unit}
                <i />
                {theme === 'dark' ? 'Dark theme' : 'Live component'}
              </span>
            </div>
          </section>
          <div className="product-window">
            <div className="window-bar">
              <span className="window-dots" aria-hidden="true">
                ● ● ●
              </span>
              <span>{dataset.title}</span>
              <span className="window-tag">SYNTHETIC DEMO</span>
            </div>
            <DeepScroll
              key={`${scene.id}:${take}`}
              provider={dataset.provider}
              ariaLabel={dataset.ariaLabel}
              controllerRef={controller}
              onStats={setStats}
              initialIndex={scene.index ?? dataset.initialIndex}
              rowHeight={dynamic ? 120 : dataset.rowHeight}
              dynamicRowHeight={dynamic}
              header={dynamic ? 'Expandable observations' : dataset.header}
              theme={theme}
              stickyChapters
              atlas={dataset.atlas}
              features={{ hints: false, automaticAggregation: false }}
              className={`demo-explorer dataset-${dataset.id}`}
              classNames={{
                row: dataset.id === 'signal' ? 'signal-row' : `demo-row ${dataset.id}-row`,
              }}
              renderRow={(context) =>
                dataset.renderRow(context, {
                  dynamic,
                  expanded,
                  toggle: (index) =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(index)) next.delete(index);
                      else next.add(index);
                      return next;
                    }),
                })
              }
            />
          </div>
          <footer className="stage-bottom">
            <span>{scene.detail}</span>
            <span>
              EXPLORE AT EVERY SCALE <span aria-hidden="true">↘</span>
            </span>
          </footer>
        </article>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Studio />);
