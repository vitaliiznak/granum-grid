import {
  GranumGrid,
  decodeView,
  encodeView,
  type ScrollStats,
  type AtlasRailOptions,
  type GranumGridApi,
  type SavedView,
  type ScrollAlignment,
  type RowRenderContext,
  type RowActivationContext,
} from 'granum-grid';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { MapSettings } from './MapSettings';
import { DEMO_SWITCHES, DebugTools, switchMap } from './DebugTools';
import { DemoLimitations } from './DemoLimitations';
import { useFrameRate } from './useFrameRate';
import { RowInspector } from './RowInspector';
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
import { ParquetImport } from './ParquetImport';
import { SqlImport } from './SqlImport';
import { fileStart } from './datasets/sql';
import { parquet as bundledParquet, parquetDetails } from './datasets/parquet';
import { useExplorerTools } from './explorer';
import type { DemoDataset } from './datasets';

type Api = RefObject<GranumGridApi<unknown> | null>;

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
  const isParquet = dataset.id === 'parquet';
  const live =
    dataset.id === 'hackernews'
      ? 'hackernews'
      : isParquet
        ? 'parquet'
        : dataset.id === 'file'
          ? 'sql'
          : undefined;
  const [parquetDataset, setParquetDataset] = useState<DemoDataset>(bundledParquet);
  // An opened file lives only in this tab; the card keeps its latest revision.
  const [fileDataset, setFileDataset] = useState<DemoDataset>(fileStart);
  // A pasted Parquet URL reopens from `?url=`; it has no full-page link.
  const ownParquet = isParquet && !parquetDetails(provider)?.bundled;
  const [shared] = useState(() =>
    decodeView(window.location.hash.replace(/^#view=/, ''), provider),
  );
  // A link to a row of a pasted Parquet URL is read once that file has opened.
  const fileLink = useRef(
    isParquet &&
      window.location.hash.startsWith('#view=') &&
      new URLSearchParams(window.location.search).has('url'),
  );
  const [invalidLink, setInvalidLink] = useState(
    () => window.location.hash.startsWith('#view=') && !shared && !fileLink.current,
  );
  const [datasetMapSettings, setDatasetMapSettings] = useState<Record<string, AtlasRailOptions>>(
    {},
  );
  const [latency, updateLatency] = useState(DEFAULT_LATENCY);
  const [switches, setSwitches] = useState(DEMO_SWITCHES);
  const [theme, setTheme] = useState<'dark' | 'light'>('light');
  const [reduced, setReduced] = useState(false);
  const [stats, setStats] = useState<ScrollStats | null>(null);
  const [dynamic, setDynamic] = useState(false);
  const [expanded, setExpanded] = useState(new Set<number>());
  const api: Api = useRef<GranumGridApi<unknown>>(null);
  const fps = useFrameRate(api, provider);
  /** Each dataset keeps its own place while you visit the others. */
  const places = useRef(new Map<string, SavedView>());
  const providerKey = `${provider.id}:${provider.revision}`;
  const [inspected, setInspected] = useState<{
    providerKey: string;
    record: RowActivationContext<unknown>;
  } | null>(null);
  const closeInspector = useCallback(() => {
    setInspected(null);
    document
      .querySelector<HTMLElement>('.demo-explorer [role="grid"]')
      ?.focus({ preventScroll: true });
  }, []);
  const showRow = useCallback(
    (index: number) => {
      const mounted = api.current;
      const count = mounted?.getSnapshot().rowCount ?? 0;
      if (!mounted || index < 0 || index >= count) return;
      mounted.goTo(index);
      closeInspector();
    },
    [closeInspector],
  );
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
      dataset.renderRow(context, {
        dynamic,
        expanded,
        toggle: toggleExpanded,
        show: showRow,
      }),
    [dataset, dynamic, expanded, toggleExpanded, showRow],
  );
  const rowClassNames = useMemo(
    () => ({ row: isSignal ? 'signal-row' : `demo-row ${dataset.id}-row` }),
    [isSignal, dataset.id],
  );
  const dynamicRowHeight = isSignal && dynamic;
  const comparison = useMemo(
    () => ({
      provider,
      rowHeight: dataset.rowHeight,
      dynamicRowHeight,
      theme,
      classNames: rowClassNames,
      renderRow,
    }),
    [provider, dataset.rowHeight, dynamicRowHeight, theme, rowClassNames, renderRow],
  );
  // Selection, bookmarks, comparison, and hints are playground features on the public API.
  const tools = useExplorerTools(provider, {
    comparison,
    storageKey: `granum-demo:${providerKey}`,
    formatRange: dataset.formatRange,
    hints: switches.hints && { storageKey: 'granum-hints-v1' },
  });
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
  };
  const chooseDataset = (id: string) => {
    if (id === dataset.id) return;
    // The place, not the selection, carries over when the visitor returns.
    const current = api.current?.getView();
    if (current) places.current.set(dataset.id, { ...current, selection: null });
    const next = id === 'parquet' ? parquetDataset : id === 'file' ? fileDataset : findDataset(id);
    setDataset(next);
    setInspected(null);
    setStats(null);
    setDynamic(false);
    const params = new URLSearchParams(location.search);
    if (id === 'logs') params.delete('dataset');
    else params.set('dataset', id);
    const fileUrl = id === 'parquet' && parquetDetails(next.provider);
    if (fileUrl && !fileUrl.bundled) params.set('url', fileUrl.url);
    else params.delete('url');
    replaceUrl(params);
  };
  const loadParquet = (next: DemoDataset) => {
    setParquetDataset(next);
    setDataset(next);
    setInspected(null);
    setStats(null);
    places.current.delete('parquet');
    if (fileLink.current) {
      fileLink.current = false;
      const linked = decodeView(window.location.hash.replace(/^#view=/, ''), next.provider);
      if (linked) places.current.set('parquet', linked);
      else setInvalidLink(true);
    }
    const file = parquetDetails(next.provider);
    replaceUrl(
      new URLSearchParams(
        file && !file.bundled ? { dataset: 'parquet', url: file.url } : { dataset: 'parquet' },
      ),
    );
  };
  const loadFile = (next: DemoDataset) => {
    setFileDataset(next);
    setDataset(next);
    setInspected(null);
    setStats(null);
    // A revision has its own addresses, so the previous revision's place does not carry over.
    places.current.delete('file');
    replaceUrl(new URLSearchParams({ dataset: 'file' }));
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
    const off = mountedApi.subscribe(sync);
    return () => {
      clearTimeout(timer);
      off();
    };
    // A new revision (a filtered file, another Parquet URL) keeps the dataset id; it creates a
    // new controller.
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
  // A rebuilt engine (row sizing changed) starts where the reader is; the explorer ignores a
  // view that belongs to another dataset or revision.
  const initialView =
    mounted.current === providerKey
      ? (api.current?.getView() ?? shared)
      : places.current.get(dataset.id);
  return (
    <main className={pageMode ? 'app app-page' : 'app'}>
      {!pageMode && (
        <>
          <SiteHeader theme={theme} onTheme={setTheme} />
          <DatasetGallery current={dataset} onChange={chooseDataset} />
          <DatasetIntro dataset={dataset} stats={stats}>
            <DemoLimitations live={live} />
          </DatasetIntro>
          {isParquet && (
            <ParquetImport
              dataset={dataset}
              initialUrl={new URLSearchParams(location.search).get('url')}
              onLoad={loadParquet}
              linkToRow={() => {
                const view = api.current?.getView();
                const file = parquetDetails(provider);
                if (!view || !file) return null;
                const params = new URLSearchParams({ dataset: 'parquet' });
                if (!file.bundled) params.set('url', file.url);
                return `${location.origin}${location.pathname}?${params}#view=${encodeView(view)}`;
              }}
            />
          )}
          {dataset.id === 'file' && (
            // Each revision remounts the panel, so its fields show that revision's view.
            <SqlImport
              key={`${provider.id}:${provider.revision}`}
              dataset={dataset}
              onLoad={loadFile}
            />
          )}
          <FeatureTour dataset={dataset} api={api}>
            {isSignal && (
              <button
                className="text-button"
                aria-label="Try row 73,500,000"
                onClick={() => api.current?.goTo(73_499_999)}
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
        onSelectionChange={() => {
          // The new selection is already part of the mounted view.
          if (pageMode && api.current)
            history.replaceState(null, '', pageUrl(dataset.id, encodeView(api.current.getView())));
        }}
        panel={tools.panel}
        markers={tools.markers}
        stickyChapters
        footer
        toolbar={{
          fullPageUrl:
            // A local file lives in this tab only, so a new page could not reopen it.
            pageMode || ownParquet || dataset.id === 'file'
              ? undefined
              : (view) => pageUrl(dataset.id, encodeView(view)),
          actions: (
            <>
              {dataset.renderDetails && (
                <span className="inspector-hint">Click a row or press Enter to inspect</span>
              )}
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
                  <DemoLimitations live={live} compact />
                </>
              )}
              <DebugTools
                latency={latency}
                onLatency={changeLatency}
                simulateLatency={!live}
                switches={switches}
                onSwitches={setSwitches}
                reduced={reduced}
                onReduced={setReduced}
                stats={stats}
                fps={fps}
                onReset={() => {
                  changeLatency(DEFAULT_LATENCY);
                  setSwitches(DEMO_SWITCHES);
                  setReduced(false);
                  setDynamic(false);
                }}
              >
                {isSignal && <RowSizing api={api} dynamic={dynamic} onDynamic={setDynamic} />}
              </DebugTools>
            </>
          ),
        }}
        provider={provider}
        dataMode={grow ? 'append' : undefined}
        cache={dataset.cache}
        rail={{
          ...switchMap(atlas, switches),
          ...tools.rail,
          actions: (
            <MapSettings
              value={atlas}
              onChange={changeMapSettings}
              onReset={() => setDatasetMapSettings((current) => ({ ...current, [dataset.id]: {} }))}
              labels={dataset.map}
            />
          ),
        }}
        ariaLabel={dataset.ariaLabel}
        header={dataset.header}
        rowHeight={dataset.rowHeight}
        dynamicRowHeight={dynamicRowHeight}
        initialIndex={dataset.initialIndex}
        initialView={initialView}
        apiRef={api}
        theme={theme}
        prefetch={switches.prefetch}
        reducedMotion={reduced ? true : 'system'}
        onStats={setStats}
        className={`demo-explorer dataset-${dataset.id}`}
        classNames={rowClassNames}
        renderRow={renderRow}
        onRowActivate={
          dataset.renderDetails ? (record) => setInspected({ providerKey, record }) : undefined
        }
      />
      {inspected?.providerKey === providerKey && dataset.renderDetails && (
        <RowInspector
          key={`${providerKey}:${inspected.record.index}`}
          record={inspected.record}
          className={dataset.inspectorClassName}
          copyLabel={dataset.copyLabel}
          onClose={closeInspector}
        >
          {dataset.renderDetails(inspected.record.row, { show: showRow })}
        </RowInspector>
      )}
      {!pageMode && <ShortcutStrip />}
    </main>
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
  const [saved, setSaved] = useState<SavedView | null>(null);
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
          <button onClick={() => setSaved(api.current?.getView() ?? null)}>Save position</button>
          <button disabled={!saved} onClick={() => saved && api.current?.restoreView(saved)}>
            Restore position
          </button>
        </div>
      )}
    </section>
  );
}
