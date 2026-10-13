import type { CSSProperties, ReactNode } from 'react';
import { useDeepScroll, type UseDeepScrollOptions } from './useDeepScroll.js';
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
  return <section className={`ds-root ${props.className ?? ''}`} style={props.style} data-theme={props.theme ?? 'system'}>
    <div className="ds-toolbar"><span className="ds-context">Indexed dataset <span>/</span> {snapshot.rowCount.toLocaleString()} records</span><span className="ds-view-active">Rows</span></div>
    <div className="ds-body"><div {...scroll.getViewportProps({ 'aria-label': props.ariaLabel })}>
      {scroll.rows.map(slot => <div key={slot.index} {...scroll.getRowProps(slot)} data-focused={slot.index === snapshot.activeIndex || undefined}>
        {slot.status === 'ready' ? props.renderRow({ row: slot.row, index: slot.index, rowNumber: slot.index + 1, focused: slot.index === snapshot.activeIndex }) : props.renderPlaceholder?.(slot) ?? <><span role="gridcell" className="ds-row-id">{(slot.index + 1).toLocaleString()}</span><span role="gridcell" className="ds-loading">{slot.error || 'Loading reading…'}</span></>}
      </div>)}
      {!snapshot.rowCount && <div className="ds-empty">No rows in this dataset.</div>}
    </div><AtlasRail scroll={scroll}/></div>
    <footer className="ds-footer"><span data-testid="position">Row <strong>{snapshot.rowCount ? ((snapshot.activeIndex ?? 0) + 1).toLocaleString() : '0'}</strong> of {snapshot.rowCount.toLocaleString()}</span><span>{(snapshot.progress * 100).toFixed(2)}% explored</span></footer>
  </section>;
}
