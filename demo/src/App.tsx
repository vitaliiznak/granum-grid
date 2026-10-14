import {
  GranumGrid,
  decodeView,
  encodeView,
  defaultFeatures,
  type ScrollStats,
  type AtlasRailOptions,
  type GranumGridApi,
  type NavigationLocation,
  type ScrollAlignment,
  type RowRenderContext,
  type View,
} from 'granum-grid';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { LiveExample } from './LiveExample';
import { StylingExamples } from './StylingExamples';
import { ToolsDemo } from './ai/ToolsDemo';
import { MapSettings } from './MapSettings';
import { DebugTools } from './DebugTools';
import { DemoLimitations } from './DemoLimitations';
import {
  DatasetGallery,
  DatasetIntro,
  DatasetSwitcher,
  FeatureTour,
  ShortcutStrip,
} from './Showcase';
import { findDataset } from './datasets';
import { stopWorker } from './data/worker-client';
import { DEFAULT_LATENCY, setLatency } from './data/latency';
import { TraceImport } from './TraceImport';
import { performance as bundledPerformance } from './datasets/performance';
import type { DemoDataset } from './datasets';

type Api = RefObject<GranumGridApi<unknown> | null>;
/** Context hints would cover the guided demo; every other feature starts on. */
const DEMO_FEATURES = { ...defaultFeatures, hints: false };

const pageUrl = (dataset: string, hash: string) =>
  `${location.pathname}?page=1${dataset === 'logs' ? '' : `&dataset=${dataset}`}#view=${hash}`;
/** Replace the address without a navigation; `hash` includes its leading `#`. */
function replaceUrl(params: URLSearchParams, hash = '') {
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${hash}`);
}

export default function App() {
  const [pageMode, setPageMode] = useState(
    () => new URLSearchParams(window.location.search).get('page') === '1',
  );
  const [dataset, setDataset] = useState(() =>
    findDataset(new URLSearchParams(window.location.search).get('dataset')),
  );
  const provider = dataset.provider;
  const isRecording = dataset.id === 'performance';
  const live =
    dataset.id === 'bitcoin' ? 'binance' : dataset.id === 'hackernews' ? 'hackernews' : undefined;
  const [recordingDataset, setRecordingDataset] = useState(bundledPerformance);
  const isImported = isRecording && provider.revision.startsWith('local-');
  const [shared] = useState(() =>
    decodeView(window.location.hash.replace(/^#view=/, ''), provider),
  );
  const [invalidLink] = useState(() => window.location.hash.startsWith('#view=') && !shared);
  const [datasetMapSettings, setDatasetMapSettings] = useState<Record<string, AtlasRailOptions>>(
    {},
  );
  const [latency, updateLatency] = useState(DEFAULT_LATENCY);
  const [features, setFeatures] = useState(DEMO_FEATURES);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [reduced, setReduced] = useState(false);
  const [stats, setStats] = useState<ScrollStats | null>(null);
  const [dynamic, setDynamic] = useState(false);
  const [expanded, setExpanded] = useState(new Set<number>());
  const api: Api = useRef<GranumGridApi<unknown>>(null);
  /** Each dataset keeps its own place while you visit the others. */
  const locations = useRef(new Map<string, NavigationLocation>());
  const providerKey = `${provider.id}:${provider.revision}`;
  const mounted = useRef(providerKey);
  useEffect(() => {
    mounted.current = providerKey;
  }, [providerKey]);
  const isSignal = dataset.id === 'signal';
  // Stable row rendering: onStats updates this component often, and rows only re-render
  // when their own data or these row options change.
  const toggleExpanded = useCallback(
    (index: number) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      }),
    [],
  );
  const renderRow = useCallback(
    (context: RowRenderContext<unknown>) =>
      dataset.renderRow(context, { dynamic, expanded, toggle: toggleExpanded }),
    [dataset, dynamic, expanded, toggleExpanded],
  );
  const atlasSettings = datasetMapSettings[dataset.id] ?? {};
  const changeMapSettings = (patch: AtlasRailOptions) =>
    setDatasetMapSettings((current) => ({
      ...current,
      [dataset.id]: { ...current[dataset.id], ...patch },
    }));
  const atlas: AtlasRailOptions = {
    layout: 'compact',
    showMagnifier: true,
    ...dataset.atlas,
    ...atlasSettings,
    axisLabel: atlasSettings.axis === 'rows' ? 'Row' : dataset.atlas.axisLabel,
  };
  const chooseDataset = (id: string) => {
    if (id === dataset.id) return;
    const current = api.current?.controller.getLocation();
    if (current) locations.current.set(dataset.id, current);
    const next = id === 'performance' ? recordingDataset : findDataset(id);
    setDataset(next);
    setStats(null);
    setDynamic(false);
    const params = new URLSearchParams(location.search);
    if (id === 'logs') params.delete('dataset');
    else params.set('dataset', id);
    replaceUrl(params);
  };
  const loadRecording = (next: DemoDataset) => {
    setRecordingDataset(next);
    setDataset(next);
    setStats(null);
    locations.current.delete('performance');
    replaceUrl(new URLSearchParams({ dataset: 'performance' }));
  };
  useEffect(() => {
    const mountedApi = api.current;
    if (!pageMode || !mountedApi) return;
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => history.replaceState(null, '', pageUrl(dataset.id, encodeView(mountedApi.getView()))),
        200,
      );
    };
    const off = mountedApi.controller.subscribe(sync);
    return () => {
      clearTimeout(timer);
      off();
    };
    // A replaced recording keeps the dataset id; its revision creates a new controller.
  }, [pageMode, dynamic, dataset.id, provider.id, provider.revision]);
  // A live source learns its current row count after mount; append mode keeps every address.
  const grow = dataset.grow;
  useEffect(() => {
    if (!grow) return;
    const controller = new AbortController();
    grow(controller.signal).then(
      (next) =>
        setDataset((current) =>
          current.id === next.id && next.provider.rowCount > current.provider.rowCount
            ? next
            : current,
        ),
      // The estimated count stays usable; row requests report their own failures.
      () => {},
    );
    return () => controller.abort();
  }, [grow]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    document.title = `Granum Grid / ${dataset.title}`;
  }, [dataset]);
  useEffect(() => () => stopWorker(), []);
  const changeLatency = (value: number) => {
    updateLatency(value);
    setLatency(value);
  };
  const returnToNormal = () => {
    const params = new URLSearchParams(location.search);
    params.delete('page');
    replaceUrl(params, api.current ? `#view=${encodeView(api.current.getView())}` : location.hash);
    setPageMode(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.querySelector<HTMLElement>('.demo-explorer [role="grid"]')?.focus({
        preventScroll: true,
      });
    });
  };
  const initialLocation =
    mounted.current === providerKey
      ? (api.current?.controller.getLocation() ??
        (shared?.dataset === provider.id && shared.revision === provider.revision
          ? shared.location
          : undefined))
      : locations.current.get(dataset.id);
  return (
    <main className={pageMode ? 'app app-page' : 'app'}>
      {!pageMode && (
        <>
          <SiteHeader theme={theme} onTheme={setTheme} />
          <DatasetGallery current={dataset} onChange={chooseDataset} />
          <DatasetIntro dataset={dataset} stats={stats}>
            <DemoLimitations recording={isRecording} imported={isImported} live={live} />
          </DatasetIntro>
          {isRecording && <TraceImport imported={isImported} onLoad={loadRecording} />}
          <FeatureTour dataset={dataset} api={api}>
            {isSignal && (
              <button
                className="text-button"
                aria-label="Try row 73,500,000"
                onClick={() => api.current?.controller.goTo(73_499_999)}
              >
                Try row 73.5M <span aria-hidden="true">→</span>
              </button>
            )}
          </FeatureTour>
        </>
      )}
      {invalidLink && (
        <div role="alert" className="shared-view-error">
          This saved view does not match this dataset revision. Showing the beginning.
        </div>
      )}
      <GranumGrid
        key={providerKey}
        layout={pageMode ? 'page' : 'embedded'}
        initialSelection={shared?.dataset === provider.id ? shared.selection : null}
        onSelectionChange={() => {
          // The new selection is already part of the mounted view.
          if (pageMode && api.current)
            history.replaceState(null, '', pageUrl(dataset.id, encodeView(api.current.getView())));
        }}
        bookmarkStorageKey={isImported ? undefined : `deepscroll-demo:${providerKey}`}
        stickyChapters
        fullPageUrl={
          pageMode || isImported ? undefined : (view) => pageUrl(dataset.id, encodeView(view))
        }
        toolbarActions={
          <>
            {pageMode && (
              <>
                <DatasetSwitcher
                  value={dataset.id}
                  onChange={(id) => {
                    chooseDataset(id);
                    // The explorer remounts on a provider change; keep focus on the switcher.
                    requestAnimationFrame(() => {
                      document
                        .querySelector<HTMLElement>('.dataset-switcher [aria-pressed="true"]')
                        ?.focus({ preventScroll: true });
                    });
                  }}
                />
                <button className="ds-button" onClick={returnToNormal}>
                  <span aria-hidden="true">↙ </span>Back to normal view
                </button>
                <DemoLimitations
                  recording={isRecording}
                  imported={isImported}
                  live={live}
                  compact
                />
              </>
            )}
            <DebugTools
              latency={latency}
              onLatency={changeLatency}
              simulateLatency={!isRecording && !live}
              features={features}
              onFeatures={setFeatures}
              reduced={reduced}
              onReduced={setReduced}
              stats={stats}
              onReset={() => {
                changeLatency(DEFAULT_LATENCY);
                setFeatures(DEMO_FEATURES);
                setReduced(false);
                setDynamic(false);
              }}
            >
              {isSignal && <RowSizing api={api} dynamic={dynamic} onDynamic={setDynamic} />}
            </DebugTools>
          </>
        }
        provider={provider}
        dataMode={grow ? 'append' : undefined}
        cache={dataset.cache}
        atlas={atlas}
        railActions={
          <>
            <RailView api={api} resetKey={providerKey} />
            <MapSettings
              value={atlas}
              onChange={changeMapSettings}
              onReset={() => setDatasetMapSettings((current) => ({ ...current, [dataset.id]: {} }))}
              labels={dataset.map}
            />
          </>
        }
        ariaLabel={dataset.ariaLabel}
        header={dataset.header}
        formatRange={dataset.formatRange}
        summaryBucketSizes={dataset.summaryBucketSizes}
        formatBucketSize={dataset.formatBucketSize}
        renderAggregate={dataset.renderAggregate}
        aggregateRowHeight={isRecording ? 156 : 120}
        rowHeight={dataset.rowHeight}
        dynamicRowHeight={isSignal && dynamic}
        initialIndex={dataset.initialIndex}
        initialLocation={initialLocation}
        apiRef={api}
        theme={theme}
        features={features}
        reducedMotion={reduced ? true : 'system'}
        onStats={setStats}
        className={`demo-explorer dataset-${dataset.id}`}
        classNames={{ row: isSignal ? 'signal-row' : `demo-row ${dataset.id}-row` }}
        renderRow={renderRow}
      />
      {!pageMode && (
        <>
          <ShortcutStrip />
          <LiveExample />
          <StylingExamples />
          <ToolsDemo key={providerKey} datasetId={dataset.id} provider={provider} apiRef={api} />
          <footer className="site-footer">
            <span>
              {dataset.sourceNote ?? 'Rows generated on demand. Overview uses sampled values.'}
            </span>
            <span>Granum Grid 0.1</span>
          </footer>
        </>
      )}
    </main>
  );
}

/** Row detail is one row per 22px or closer. Summaries from that scale open grouped. */
const ROW_DETAIL_MAX_ROWS_PER_PIXEL = 1 / 22;

function RailView({ api, resetKey }: { api: Api; resetKey: string }) {
  const [view, setView] = useState<View>('rows');
  const [describedBy, setDescribedBy] = useState<string>();
  const select = useRef<HTMLSelectElement>(null);
  // A passive effect: the explorer attaches `api` during layout, after this nested control's
  // own layout effects would run.
  useEffect(() => {
    const controller = api.current?.controller;
    if (!controller) return;
    const sync = () => {
      const next = controller.getSnapshot().view;
      setView((current) => (current === next ? current : next));
    };
    sync();
    // Describe the choice with the explorer's own view guidance, as its built-in menu does.
    setDescribedBy(
      select.current?.closest('[data-ds-root]')?.querySelector('.ds-view-guide > summary > [id]')
        ?.id,
    );
    return controller.subscribe(sync);
  }, [api, resetKey]);
  return (
    <label className="rail-view">
      <span>View</span>
      {/* The narrow rail shows a short name; the native select keeps the full option names. */}
      <span className="rail-view-control">
        <span className="rail-view-value" aria-hidden="true">
          {view === 'zoom' ? 'Summaries' : 'Rows'}
        </span>
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path d="m2.5 4 2.5 2.5L7.5 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
        </svg>
        <select
          ref={select}
          className="ds-input"
          aria-label="View"
          aria-describedby={describedBy}
          title="Change view"
          value={view}
          onChange={(event) => {
            const next = event.target.value as View;
            const controller = api.current?.controller;
            if (!controller) return;
            const scale = controller.getSnapshot().rowsPerPixel;
            controller.setView(next);
            if (next === 'zoom' && scale <= ROW_DETAIL_MAX_ROWS_PER_PIXEL) controller.setZoom(1);
            setView(next);
          }}
        >
          <option value="rows">Rows</option>
          <option value="zoom">Range summaries</option>
        </select>
      </span>
    </label>
  );
}

function SiteHeader({
  theme,
  onTheme,
}: {
  theme: 'dark' | 'light';
  onTheme(theme: 'dark' | 'light'): void;
}) {
  return (
    <header className="site-header">
      <a className="wordmark" href={import.meta.env.BASE_URL} aria-label="Granum Grid home">
        <svg className="logo" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <rect width="20" height="20" rx="4" fill="currentColor" />
          <path d="M5 6h10M5 10h7M5 14h4" stroke="var(--page)" strokeWidth="1.5" />
        </svg>
        Granum Grid <span className="header-divider">/</span>
        <span className="header-location">Demo</span>
      </a>
      <div className="header-controls">
        <a
          href="#integration"
          onClick={() => {
            const section = document.getElementById('integration') as HTMLDetailsElement | null;
            if (section) section.open = true;
          }}
        >
          Use in React <span aria-hidden="true">↗</span>
        </a>
        <button
          className="theme-toggle"
          aria-label="Toggle color theme"
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
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
  );
}

/** Debug controls for the signal dataset's dynamic row heights. */
function RowSizing({
  api,
  dynamic,
  onDynamic,
}: {
  api: Api;
  dynamic: boolean;
  onDynamic(dynamic: boolean): void;
}) {
  const [targetRow, setTargetRow] = useState(73_500_000);
  const [align, setAlign] = useState<ScrollAlignment>('center');
  const [saved, setSaved] = useState<NavigationLocation | null>(null);
  return (
    <section className="debug-section" aria-label="Row sizing">
      <h3>Row sizing</h3>
      <label className="feature-switch">
        <input
          type="checkbox"
          checked={dynamic}
          onChange={(event) => onDynamic(event.target.checked)}
        />
        Dynamic row heights
      </label>
      {dynamic && (
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
              api.current?.scrollToIndex(targetRow - 1, { align })
            }
          >
            Go to row
          </button>
          <button onClick={() => setSaved(api.current?.controller.getLocation() ?? null)}>
            Save position
          </button>
          <button disabled={!saved} onClick={() => saved && api.current?.controller.restore(saved)}>
            Restore position
          </button>
        </div>
      )}
    </section>
  );
}
