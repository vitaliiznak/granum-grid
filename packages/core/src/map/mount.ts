import type { GranumGridApi } from '../core/api.js';
import { clamp, rowToProgress } from '../core/mappings.js';
import type { Bucket, Marker, RowRange } from '../data/types.js';
import { atlasDomain, drawAtlas, observeCanvas } from './atlas.js';
import { atlasPeaks } from './atlasGravity.js';
import { clusterMarkers, leadMarker } from './markers.js';
import { beginScrub, moveScrub, type Scrub, type TrackGeometry } from './scrub.js';

/**
 * What the map needs from a scroller it does not own: how many rows, which are in view, a
 * signal when either changes, and a way to bring a row to the top. `scrub` methods are
 * optional; with them a drag becomes one history entry, without them it scrolls as it goes.
 */
export interface MapTarget {
  rowCount(): number;
  /** Rows in view, half-open. */
  visibleRange(): RowRange;
  subscribe(listener: () => void): () => void;
  /** Bring `index` to the top of the view. */
  scrollToIndex(index: number): void;
  beginScrub?(): void;
  scrub?(position: number): void;
  endScrub?(cancel: boolean): void;
}

export interface MapOptions {
  target: MapTarget;
  /** The whole dataset's profile, such as a provider's `fetchOverview` result. */
  overview?: readonly Bucket[];
  metric?: { label: string; kind?: 'value' | 'density'; domain?: readonly [number, number] };
  /** Named places; a click on one scrolls there. */
  markers?: readonly Marker[];
  /** The slider's accessible name. Default `Dataset position`. */
  ariaLabel?: string;
  title?: string;
  /** Slow the drag when the pointer moves sideways. Default true. */
  precision?: boolean;
  /** Pull slow drags onto nearby markers and chart peaks. Default true. */
  snapToMarkers?: boolean;
  snapToPeaks?: boolean;
}

export interface MountedMap {
  /** Replace the overview, markers, or metric, such as when a provider's summary arrives. */
  update(next: Partial<Pick<MapOptions, 'overview' | 'markers' | 'metric'>>): void;
  destroy(): void;
}

/** A Granum explorer's handle, from `@granum/react`'s `apiRef` or `mount()`, as a target. */
export function gridTarget(api: GranumGridApi<unknown>): MapTarget {
  return {
    rowCount: () => api.getSnapshot().rowCount,
    visibleRange: api.getVisibleRange,
    subscribe: api.subscribe,
    scrollToIndex: (index) => api.goTo(index),
    beginScrub: api.beginScrub,
    scrub: api.scrub,
    endScrub: api.endScrub,
  };
}

/**
 * A plain scroll container of fixed-height rows, such as an overflow list or another
 * virtualizer's element. Its total height must fit the browser's element-height limit.
 */
export function scrollerTarget(
  element: HTMLElement,
  { rowCount, rowHeight }: { rowCount: number | (() => number); rowHeight: number },
): MapTarget {
  const count = () => (typeof rowCount === 'function' ? rowCount() : rowCount);
  return {
    rowCount: count,
    visibleRange: () => ({
      start: clamp(Math.floor(element.scrollTop / rowHeight), 0, count()),
      end: clamp(Math.ceil((element.scrollTop + element.clientHeight) / rowHeight), 0, count()),
    }),
    subscribe(listener) {
      const observer = new ResizeObserver(listener);
      observer.observe(element);
      element.addEventListener('scroll', listener, { passive: true });
      return () => {
        observer.disconnect();
        element.removeEventListener('scroll', listener);
      };
    },
    scrollToIndex: (index) => {
      element.scrollTop = index * rowHeight;
    },
  };
}

/**
 * The dataset map without a framework: the whole dataset's profile, the rows in view, named
 * places, and the same precise dragging as `@granum/react`'s `AtlasRail`, driving any
 * scroller through a `MapTarget`. Style it with `@granum/core/styles.css` or `base.css`.
 */
export function mountMap(element: HTMLElement, options: MapOptions): MountedMap {
  const { target, ariaLabel = 'Dataset position', precision = true } = options;
  let { overview = [], markers = [], metric } = options;
  const document = element.ownerDocument;
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
    const child = document.createElement(tag);
    child.className = className;
    return child;
  };
  const root = node('div', 'gr-root gr-map-root');
  root.dataset.grRoot = '';
  root.dataset.theme = 'system';
  root.style.height = '100%';
  const rail = node('aside', 'gr-rail');
  rail.dataset.grPart = 'rail';
  rail.dataset.layout = 'compact';
  rail.dataset.variant = 'profile';
  rail.dataset.markerLabels = 'none';
  rail.dataset.showMarkers = 'true';
  rail.setAttribute('aria-label', 'Dataset scrollbar');
  // Beside the explorer the rail takes its height from the row; alone it fills the element.
  rail.style.cssText = 'flex:1;width:100%;min-height:0';
  const title = node('div', 'gr-rail-title');
  title.innerHTML = '<strong><span class="gr-map-title"></span></strong>';
  title.querySelector('span')!.textContent = options.title ?? 'Scrollbar';
  const track = node('div', 'gr-track');
  track.setAttribute('role', 'group');
  track.setAttribute('aria-label', 'Dataset scrollbar navigation');
  const plot = node('div', 'gr-map-plot');
  const canvas = node('canvas', 'gr-overview-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  plot.append(canvas);
  const markerLayer = node('div', 'gr-map-markers');
  const visible = node('span', 'gr-visible-range');
  visible.setAttribute('aria-hidden', 'true');
  const scrollbar = node('span', 'gr-scrollbar-track');
  scrollbar.setAttribute('aria-hidden', 'true');
  const thumb = node('span', 'gr-thumb');
  thumb.setAttribute('role', 'slider');
  thumb.tabIndex = 0;
  thumb.setAttribute('aria-label', ariaLabel);
  thumb.setAttribute('aria-orientation', 'vertical');
  const line = node('span', 'gr-track-line');
  track.append(plot, markerLayer, visible, scrollbar, thumb, line);
  rail.append(title, track);
  root.append(rail);
  element.append(root);

  let domain = atlasDomain(overview as Bucket[], metric?.domain, metric?.kind);
  let peaks: number[] = [];
  const kind = () => metric?.kind ?? 'value';
  const recompute = () => {
    domain = atlasDomain(overview as Bucket[], metric?.domain, metric?.kind);
    peaks = options.snapToPeaks === false ? [] : atlasPeaks(overview as Bucket[], domain, kind());
  };
  recompute();
  const draw = () =>
    drawAtlas(canvas, overview as Bucket[], target.rowCount(), domain, kind(), false);

  const drawMarkers = () => {
    const total = target.rowCount();
    markerLayer.replaceChildren(
      ...clusterMarkers(markers, total, track.clientHeight || 400).map((items) => {
        const lead = leadMarker(items);
        const button = node('button', 'gr-button gr-marker');
        button.type = 'button';
        button.dataset.kind = lead.kind;
        if (items.length > 1) button.dataset.group = '';
        button.setAttribute(
          'aria-label',
          items.length > 1 ? `${lead.label} and ${items.length - 1} more` : lead.label,
        );
        button.title = items.map((item) => item.label).join('\n');
        button.style.top = `${rowToProgress(items[0].index, total) * 100}%`;
        const symbol = node('span', 'gr-marker-symbol');
        symbol.setAttribute('aria-hidden', 'true');
        symbol.textContent = items.length > 1 ? '●' : '◆';
        button.append(symbol);
        button.addEventListener('pointerdown', (event) => event.stopPropagation());
        button.addEventListener('click', () => target.scrollToIndex(lead.index));
        return button;
      }),
    );
  };

  const place = () => {
    const total = target.rowCount();
    const { start, end } = target.visibleRange();
    const last = Math.max(1, total - 1);
    visible.style.top = `${(start / Math.max(1, total)) * 100}%`;
    visible.style.height = `${(Math.max(0, end - start) / Math.max(1, total)) * 100}%`;
    const progress = clamp(start / last, 0, 1);
    thumb.style.top = `clamp(0px, calc(${progress * 100}% - 12px), calc(100% - 24px))`;
    line.style.top = `${progress * 100}%`;
    thumb.setAttribute('aria-valuemin', total ? '1' : '0');
    thumb.setAttribute('aria-valuemax', String(total));
    thumb.setAttribute('aria-valuenow', String(total ? start + 1 : 0));
    thumb.setAttribute(
      'aria-valuetext',
      `Row ${(total ? start + 1 : 0).toLocaleString()} of ${total.toLocaleString()}`,
    );
  };
  let frame = 0;
  const schedule = () => {
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
  };
  const unsubscribe = target.subscribe(schedule);

  let scrub: Scrub | null = null;
  const geometry = (): TrackGeometry => {
    const rect = track.getBoundingClientRect();
    return { top: rect.top, height: rect.height, rowCount: target.rowCount() };
  };
  const go = (position: number) =>
    target.scrub ? target.scrub(position) : target.scrollToIndex(Math.round(position));
  const finish = (cancel: boolean) => {
    const state = scrub;
    scrub = null;
    if (!state) return;
    if (!state.moved && !cancel) {
      target.endScrub?.(true);
      target.scrollToIndex(Math.round(state.destination));
    } else if (target.endScrub) target.endScrub(cancel);
    else if (cancel) target.scrollToIndex(Math.round(state.origin));
  };
  track.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !target.rowCount()) return;
    event.preventDefault();
    thumb.focus({ preventScroll: true });
    track.setPointerCapture(event.pointerId);
    const { start } = target.visibleRange();
    scrub = beginScrub(event.clientX, event.clientY, geometry(), {
      current: start,
      progress: start / Math.max(1, target.rowCount() - 1),
      peaks,
      free: event.shiftKey,
    });
    // As in the React map: a press jumps on release unless the pointer moves first.
    target.beginScrub?.();
  });
  track.addEventListener('pointermove', (event) => {
    if (!scrub) return;
    const move = moveScrub(scrub, event.clientX, event.clientY, geometry(), {
      precision,
      markers,
      snapToMarkers: options.snapToMarkers !== false,
      peaks,
      free: event.shiftKey,
    });
    go(move.position);
  });
  track.addEventListener('pointerup', () => finish(false));
  track.addEventListener('pointercancel', () => finish(true));
  track.addEventListener('lostpointercapture', () => finish(true));
  thumb.addEventListener('keydown', (event) => {
    const total = target.rowCount();
    const { start, end } = target.visibleRange();
    const page = Math.max(1, end - start - 1);
    const next =
      event.key === 'ArrowDown'
        ? start + 1
        : event.key === 'ArrowUp'
          ? start - 1
          : event.key === 'PageDown'
            ? start + page
            : event.key === 'PageUp'
              ? start - page
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? total - 1
                  : null;
    if (event.key === 'Escape' && scrub) {
      event.preventDefault();
      finish(true);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    target.scrollToIndex(clamp(next, 0, Math.max(0, total - 1)));
  });

  // Markers regroup at a new height: nearby ones merge on a short track.
  const stopCanvas = observeCanvas(canvas, (change) => {
    draw();
    if (change.size) drawMarkers();
  });
  drawMarkers();
  place();
  return {
    update(next) {
      if (next.overview) overview = next.overview;
      if (next.markers) markers = next.markers;
      if (next.metric) metric = next.metric;
      recompute();
      draw();
      drawMarkers();
      place();
    },
    destroy() {
      cancelAnimationFrame(frame);
      unsubscribe();
      stopCanvas();
      root.remove();
    },
  };
}
