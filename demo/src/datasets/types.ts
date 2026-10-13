import type {
  AtlasRailOptions,
  DataProvider,
  DeepScrollEngine,
  RowRenderContext,
  View,
  AggregateRenderContext,
  RowRange,
} from 'deepscroll';
import type { ReactNode } from 'react';

/** Signal-only row state owned by the page. */
export interface RowExtras {
  dynamic: boolean;
  expanded: ReadonlySet<number>;
  toggle(index: number): void;
}
export interface TourContext {
  controller: DeepScrollEngine;
  /** Open the jump bar and type a query into it. */
  search(text: string): Promise<void>;
  /** Switch to Overview and fit every row. */
  fit(): void;
}
export interface TourStep {
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
  task?: { title: string; action: string; run(controller: DeepScrollEngine): void };
  /** Materialized demo adapters must not imply only cached rows occupy memory. */
  sourceNote?: string;
  atlas: AtlasRailOptions;
  help: string;
  map: { chapters: string; profile: string; tracks: string; explain: string; sampling: string };
  tour: TourStep[];
}
const formatter = new Intl.NumberFormat('en-US');
export const formatCount = (value: number) => formatter.format(value);
export const compact = (value: number) =>
  Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
