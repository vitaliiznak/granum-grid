import {
  DeepScroll,
  decodeView,
  encodeView,
  defaultFeatures,
  type ScrollStats,
  type RowRange,
  type AtlasRailOptions,
  type DeepScrollEngine,
  type NavigationLocation,
  type ScrollAlignment,
} from 'deepscroll';
import { useEffect, useRef, useState } from 'react';
import { LiveExample } from './LiveExample';
import { StylingExamples } from './StylingExamples';
import { MapSettings } from './MapSettings';
import { Playground } from './Playground';
import { DatasetGallery, DatasetIntro, FeatureTour, ShortcutStrip } from './Showcase';
import { findDataset } from './datasets';
import { stopWorker } from './data/worker-client';
import { setLatency } from './data/provider';

const pageUrl = (dataset: string, hash: string) =>
  `${location.pathname}?page=1${dataset === 'signal' ? '' : `&dataset=${dataset}`}#view=${hash}`;
export default function App() {
  const [pageMode] = useState(
    () => new URLSearchParams(window.location.search).get('page') === '1',
  );
  const [dataset, setDataset] = useState(() =>
    findDataset(new URLSearchParams(window.location.search).get('dataset')),
  );
  const provider = dataset.provider;
  const [shared] = useState(() =>
    decodeView(window.location.hash.replace(/^#view=/, ''), provider),
  );
  const [invalidLink] = useState(
    () =>
      window.location.hash.startsWith('#view=') &&
      !decodeView(window.location.hash.slice(6), provider),
  );
  const [atlasSettings, setAtlasSettings] = useState<AtlasRailOptions>({});
  const [latency, updateLatency] = useState(80);
  const [features, setFeatures] = useState({ ...defaultFeatures, hints: false });
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [reduced, setReduced] = useState(false);
  const [stats, setStats] = useState<ScrollStats | null>(null);
  const [dynamic, setDynamic] = useState(false);
  const [expanded, setExpanded] = useState(new Set<number>());
  const [targetRow, setTargetRow] = useState(73_500_000);
  const [align, setAlign] = useState<ScrollAlignment>('center');
  const [saved, setSaved] = useState<NavigationLocation | null>(null);
  const controller = useRef<DeepScrollEngine>(null);
  const selectionRef = useRef<RowRange | null>(shared?.selection ?? null);
  /** Each dataset keeps its own place while you visit the others. */
  const locations = useRef(new Map<string, NavigationLocation>());
  const mounted = useRef(dataset.id);
  useEffect(() => {
    mounted.current = dataset.id;
  }, [dataset.id]);
  const isSignal = dataset.id === 'signal';
  const atlas: AtlasRailOptions = {
    ...dataset.atlas,
    ...atlasSettings,
    axisLabel: atlasSettings.axis === 'rows' ? 'Row' : dataset.atlas.axisLabel,
  };
  const chooseDataset = (id: string) => {
    if (id === dataset.id) return;
    const current = controller.current?.getLocation();
    if (current) locations.current.set(dataset.id, current);
    const next = findDataset(id);
    setDataset(next);
    setStats(null);
    setDynamic(false);
    selectionRef.current = null;
    const params = new URLSearchParams(location.search);
    if (id === 'signal') params.delete('dataset');
    else params.set('dataset', id);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
  };
  useEffect(() => {
    if (!pageMode || !controller.current) return;
    const engine = controller.current;
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          history.replaceState(
            null,
            '',
            pageUrl(
              dataset.id,
              encodeView({
                version: 1,
                dataset: provider.id,
                revision: provider.revision,
                location: engine.getLocation(),
                selection: selectionRef.current,
              }),
            ),
          ),
        200,
      );
    };
    const off = engine.subscribe(sync);
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [pageMode, dynamic, dataset.id]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.title = `deepscroll / ${dataset.title}`;
  }, [dataset]);
  useEffect(() => () => stopWorker(), []);
  const changeLatency = (value: number) => {
    updateLatency(value);
    setLatency(value);
  };
  const initialLocation =
    mounted.current === dataset.id
      ? (controller.current?.getLocation() ?? shared?.location)
      : locations.current.get(dataset.id);
  return (
    <main className={pageMode ? 'app app-page' : 'app'}>
      {!pageMode && (
        <>
          <header className="site-header">
            <a className="wordmark" href="/" aria-label="deepscroll home">
              <svg className="logo" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                <rect width="20" height="20" rx="4" fill="currentColor" />
                <path d="M5 6h10M5 10h7M5 14h4" stroke="var(--page)" strokeWidth="1.5" />
              </svg>
              deepscroll <span className="header-divider">/</span>
              <span className="header-location">Demo</span>
            </a>
            <div className="header-controls">
              <a
                href="#integration"
                onClick={() => {
                  const section = document.getElementById(
                    'integration',
                  ) as HTMLDetailsElement | null;
                  if (section) section.open = true;
                }}
              >
                Use in React <span aria-hidden="true">↗</span>
              </a>
              <button
                className="theme-toggle"
                aria-label="Toggle color theme"
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                <svg
                  viewBox="0 0 20 20"
                  width="17"
                  height="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  aria-hidden="true"
                >
                  {theme === 'light' ? (
                    <path d="M16 12.5A7 7 0 0 1 7.5 4a7 7 0 1 0 8.5 8.5Z" />
                  ) : (
                    <>
                      <circle cx="10" cy="10" r="3.5" />
                      <path d="M10 1v2m0 14v2M1 10h2m14 0h2M3.6 3.6 5 5m10 10 1.4 1.4M3.6 16.4 5 15M15 5l1.4-1.4" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </header>
          <DatasetGallery value={dataset.id} onChange={chooseDataset} />
          <DatasetIntro dataset={dataset} stats={stats} />
          <FeatureTour
            dataset={dataset}
            controller={controller}
            explorer={() => document.querySelector('.demo-explorer')}
          >
            <MapSettings
              value={atlas}
              onChange={setAtlasSettings}
              labels={dataset.map}
              chapters={dataset.map.chapters}
            />
            {isSignal && (
              <>
                <button
                  className="text-button"
                  aria-label="Try row 73,500,000"
                  onClick={() => controller.current?.goTo(73_499_999)}
                >
                  Try row 73.5M <span aria-hidden="true">→</span>
                </button>
                <label>
                  <input
                    type="checkbox"
                    checked={dynamic}
                    onChange={(event) => setDynamic(event.target.checked)}
                  />
                  Dynamic row heights
                </label>
              </>
            )}
          </FeatureTour>
          {isSignal && dynamic && (
            <div className="row-controls">
              <label>
                Row{' '}
                <input
                  aria-label="Target row"
                  type="number"
                  min={1}
                  max={100_000_000}
                  value={targetRow}
                  onChange={(event) => setTargetRow(event.target.valueAsNumber)}
                />
              </label>
              <label>
                Align{' '}
                <select
                  aria-label="Row alignment"
                  value={align}
                  onChange={(event) => setAlign(event.target.value as ScrollAlignment)}
                >
                  {(['start', 'center', 'end', 'auto'] as const).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <button
                onClick={() =>
                  Number.isSafeInteger(targetRow) &&
                  controller.current?.scrollToIndex(targetRow - 1, { align })
                }
              >
                Go to row
              </button>
              <button onClick={() => setSaved(controller.current?.getLocation() ?? null)}>
                Save position
              </button>
              <button disabled={!saved} onClick={() => saved && controller.current?.restore(saved)}>
                Restore position
              </button>
            </div>
          )}
        </>
      )}
      {invalidLink && (
        <div role="alert" className="shared-view-error">
          This saved view does not match this dataset revision. Showing the beginning.
        </div>
      )}
      <DeepScroll
        key={dataset.id}
        layout={pageMode ? 'page' : 'embedded'}
        initialSelection={dataset.id === shared?.dataset ? shared.selection : null}
        onSelectionChange={(range) => {
          selectionRef.current = range;
          if (pageMode && controller.current)
            history.replaceState(
              null,
              '',
              pageUrl(
                dataset.id,
                encodeView({
                  version: 1,
                  dataset: provider.id,
                  revision: provider.revision,
                  location: controller.current.getLocation(),
                  selection: range,
                }),
              ),
            );
        }}
        bookmarkStorageKey={`deepscroll-demo:${provider.id}:${provider.revision}`}
        stickyChapters
        fullPageUrl={pageMode ? undefined : (view) => pageUrl(dataset.id, encodeView(view))}
        provider={provider}
        atlas={atlas}
        ariaLabel={dataset.ariaLabel}
        header={dataset.header}
        rowHeight={dataset.rowHeight}
        dynamicRowHeight={isSignal && dynamic}
        initialIndex={dataset.initialIndex}
        initialLocation={initialLocation}
        controllerRef={controller}
        theme={theme}
        features={features}
        reducedMotion={reduced ? true : 'system'}
        onStats={setStats}
        className={`demo-explorer dataset-${dataset.id}`}
        classNames={{ row: isSignal ? 'signal-row' : `demo-row ${dataset.id}-row` }}
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
      {!pageMode && (
        <>
          <ShortcutStrip />
          <Playground
            features={features}
            onFeatures={setFeatures}
            latency={latency}
            onLatency={changeLatency}
            reduced={reduced}
            onReduced={setReduced}
            stats={stats}
          />
          <LiveExample />
          <StylingExamples />
          <footer className="site-footer">
            <span>Rows generated on demand. Overview uses sampled values.</span>
            <span>deepscroll 0.1</span>
          </footer>
        </>
      )}
    </main>
  );
}
