import type { CSSProperties, ReactNode } from 'react';
import { useDeepScroll, type UseDeepScrollOptions } from './useDeepScroll.js';
import { JumpBar } from './JumpBar.js';
import { AtlasRail } from './AtlasRail.js';
import type { PendingRowSlot } from '../data/types.js';
export interface RowRenderContext<Row> { row: Row; index: number; rowNumber: number; focused: boolean }
export interface DeepScrollProps<Row> extends UseDeepScrollOptions<Row> {
  renderRow(context: RowRenderContext<Row>): ReactNode;
  renderPlaceholder?(slot: PendingRowSlot): ReactNode;
  ariaLabel: string; className?: string; style?: CSSProperties; theme?: 'system' | 'dark' | 'light';
}
export function DeepScroll<Row>(props: DeepScrollProps<Row>) {
  const scroll = useDeepScroll(props);
  const { snapshot } = scroll;
  const chapter = scroll.session.chapters.find(c => snapshot.position >= c.start && snapshot.position < c.end);
  return <section className={`ds-root ${props.className ?? ''}`} style={props.style} data-theme={props.theme ?? 'system'} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !(event.target as HTMLElement).closest('dialog,input,textarea')) { event.preventDefault(); scroll.setJumpOpen(true); } }} onAuxClick={event => { if (event.button === 3 || event.button === 4) { event.preventDefault(); event.button === 3 ? scroll.controller.back() : scroll.controller.forward(); } }}>
    <div className="ds-toolbar"><div className="ds-toolbar-main"><div className="ds-history"><button aria-label="Back" disabled={!snapshot.canGoBack} onClick={() => scroll.controller.back()}>←</button><button aria-label="Forward" disabled={!snapshot.canGoForward} onClick={() => scroll.controller.forward()}>→</button></div><span className="ds-context" data-testid="breadcrumb">{chapter?.breadcrumb?.join(' / ') ?? chapter?.label ?? 'Indexed dataset'}</span></div><div className="ds-toolbar-actions"><span className="ds-view-active">Rows</span><button className="ds-jump-trigger" onClick={() => scroll.setJumpOpen(true)}>Jump to… <kbd>⌘ K</kbd></button></div></div>
    <div className="ds-legend"><span>ROW ADDRESS <span style={{ marginLeft: 30 }}>TIMESTAMP · CATEGORY · READING</span></span><span><i/>{props.provider.metric?.label ?? 'Overview'} · mean / range · {scroll.session.overview.some(b => b.accuracy === 'estimated') ? 'sampled' : 'exact'}</span></div>
    <div className="ds-body"><div {...scroll.getViewportProps({ 'aria-label': props.ariaLabel })}>
      {scroll.rows.map(slot => <div key={slot.index} {...scroll.getRowProps(slot)} data-focused={slot.index === snapshot.activeIndex || undefined}>
        {slot.status === 'ready' ? props.renderRow({ row: slot.row, index: slot.index, rowNumber: slot.index + 1, focused: slot.index === snapshot.activeIndex }) : props.renderPlaceholder?.(slot) ?? <><span role="gridcell" className="ds-row-id">{(slot.index + 1).toLocaleString()}</span><span role="gridcell" className="ds-loading">{slot.error ? <button onClick={() => scroll.session.retry()}>Retry rows</button> : slot.estimate ? <>≈ {slot.estimate.avg?.toFixed(1) ?? '—'} · {slot.estimate.label} <span className="ds-estimate">Approximate</span></> : 'Loading reading…'}</span></>}
      </div>)}
      {!snapshot.rowCount && <div className="ds-empty">No rows in this dataset.</div>}
    </div><AtlasRail scroll={scroll}/></div>
    <JumpBar scroll={scroll}/><div {...scroll.getAnnouncementProps()}/><footer className="ds-footer"><span data-testid="position">Row <strong>{snapshot.rowCount ? ((snapshot.activeIndex ?? 0) + 1).toLocaleString() : '0'}</strong> of {snapshot.rowCount.toLocaleString()}</span><span>{(snapshot.progress * 100).toFixed(2)}% · {scroll.stats.cachedRows.toLocaleString()} cached · {scroll.stats.activeRequests} fetching</span></footer>
  </section>;
}
