import type {
  AtlasRailOptions,
  DataProvider,
  NavigationController,
  RowRenderContext,
  View,
  AggregateRenderContext,
  RowRange,
} from 'granum-grid';
import type { ReactNode } from 'react';

/** Signal-only row state owned by the page. */
interface RowExtras {
  dynamic: boolean;
  expanded: ReadonlySet<number>;
  toggle(index: number): void;
}
export interface TourContext {
  controller: NavigationController;
  /** Open the explorer's search UI with a query. */
  search(text: string): void;
  /** Switch to Overview and fit every row. */
  fit(): void;
}
interface TourStep {
  feature: string;
  label: string;
  hint: string;
  /** Switch to this view before running the action. */
  requiredView?: View;
  run?(tour: TourContext): void | Promise<void>;
}
export interface DemoDataset<Row = any> {
  id: string;
  name: string;
  /** Short noun for the rows: bases, trades, lines… */
  unit: string;
  title: string;
  description: string;
  /** Short facts shown under the row count. */
  facts: string[];
  icon: ReactNode;
  provider: DataProvider<Row>;
  ariaLabel: string;
  rowHeight: number;
  /** First row shown before the visitor navigates. */
  initialIndex?: number;
  /** Rough size of one materialized row, used for the "if loaded" estimate. */
  bytesPerRow: number;
  header: ReactNode;
  renderRow(context: RowRenderContext<Row>, extras: RowExtras): ReactNode;
  renderAggregate?(context: AggregateRenderContext): ReactNode;
  formatRange?(range: RowRange): string;
  summaryBucketSizes?: readonly { label: string; rows: number }[];
  formatBucketSize?(rows: number): string;
  /** The suggested first action, shown before any tour step runs. */
  task: { title: string; action: string; run(controller: NavigationController): void };
  /** Materialized demo adapters must not imply only cached rows occupy memory. */
  sourceNote?: string;
  /** Where the rows come from, shown with `sourceNote`; defaults to the browser trace. */
  sourceLabel?: string;
  /** Small provider-derived profile for the dataset gallery. */
  profileValues?: (number | null)[];
  atlas: AtlasRailOptions;
  map: { chapters: string; profile: string; tracks: string; explain: string; sampling: string };
  tour: TourStep[];
}
const formatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
export const formatCount = (value: number) => formatter.format(value);
export const compact = (value: number) => compactFormatter.format(value);
/** Fit every row in Range summaries. */
export function showAll(controller: NavigationController) {
  const { rowCount } = controller.getSnapshot();
  if (rowCount) controller.zoomToRange({ start: 0, end: rowCount });
}
