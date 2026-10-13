import { GENES } from '../../demo/src/data/genome';
import { INCIDENTS, LOG_COUNT } from '../../demo/src/data/logs';
import { MARKET_EVENTS, TRADE_COUNT } from '../../demo/src/data/market';
import { NAMED_STARS } from '../../demo/src/data/stars';

export type Action = 'scroll' | 'jump' | 'overview' | 'lens' | 'search' | 'expand' | 'compare';
export interface Scene {
  id: string;
  dataset: string;
  label: string;
  title: string;
  description: string;
  detail: string;
  action: Action;
  seconds: number;
  index?: number;
  target?: number;
  theme?: 'light' | 'dark';
}

// Copy, order and timing live here. All counts, records and landmarks come from the demo.
export const scenes: Scene[] = [
  {
    id: 'hero',
    dataset: 'signal',
    label: 'Meet deepscroll',
    title: 'Big tables.\nA sense of place.',
    description: 'A React explorer that connects the whole dataset to the row you need.',
    detail: '100 million synthetic readings. Rows generated on demand.',
    action: 'scroll',
    seconds: 5,
    index: 73_499_994,
  },
  {
    id: 'jump',
    dataset: 'signal',
    label: 'Go straight there',
    title: 'Row 73,500,000.\nJust a jump away.',
    description: 'Type an address. Travel through the overview. Land on an exact row.',
    detail: 'Exact addresses · reversible jumps · keyboard navigation',
    action: 'jump',
    seconds: 6,
    index: 0,
    target: 73_499_999,
  },
  {
    id: 'overview',
    dataset: 'signal',
    label: 'See the whole picture',
    title: 'From the big picture\nto the fine print.',
    description: 'Zoom out to regional summaries. Keep the dataset map in view.',
    detail: 'Sampled summaries are labeled as estimates.',
    action: 'overview',
    seconds: 5,
    index: 49_999_999,
  },
  {
    id: 'genome',
    dataset: 'genome',
    label: 'Different data. Same explorer.',
    title: 'Billions of bases.\nOne familiar table.',
    description: 'Custom rows, chromosome chapters, and gene landmarks.',
    detail: 'Synthetic sequence · GRCh38 chromosome lengths · approximate gene positions',
    action: 'jump',
    seconds: 5,
    index: 10_000,
    target: GENES.find((gene) => gene.name === 'BRCA1')!.index,
  },
  {
    id: 'logs',
    dataset: 'logs',
    label: 'Search with context',
    title: 'Find the signal\nin a billion logs.',
    description: 'Let your provider search. Keep matches connected to the surrounding records.',
    detail: 'Generated logs · bounded sample search · no full browser scan',
    action: 'search',
    seconds: 6,
    index: Math.round(INCIDENTS[2].x * (LOG_COUNT - 1)),
  },
  {
    id: 'market',
    dataset: 'market',
    label: 'Make events navigable',
    title: 'Every event\nhas an address.',
    description: 'A market tape with custom cells, named events, and a map of the price profile.',
    detail: '750 million generated trades · illustrative prices',
    action: 'jump',
    seconds: 5,
    index: 10_000,
    target: Math.round(MARKET_EVENTS[0].x * (TRADE_COUNT - 1)),
  },
  {
    id: 'stars',
    dataset: 'stars',
    label: 'Bring your own rows',
    title: 'A whole sky.\nYour own design.',
    description: 'Custom renderers and a dark theme, with the same navigation underneath.',
    detail: 'Synthetic catalog · named-star landmarks · 1.8 billion row addresses',
    action: 'jump',
    seconds: 5,
    theme: 'dark',
    index: NAMED_STARS[0].index,
    target: NAMED_STARS.find((star) => star.name === 'Sirius')!.index,
  },
  {
    id: 'lens',
    dataset: 'signal',
    label: 'Keep your bearings',
    title: 'Focus on a row.\nKeep the context.',
    description: 'Full-size detail near your focus. Compressed context around it.',
    detail: 'List · Focus + context · Overview',
    action: 'lens',
    seconds: 5,
    index: 73_499_999,
  },
  {
    id: 'dynamic',
    dataset: 'signal',
    label: 'Room for the details',
    title: 'Rows that grow\nwith the story.',
    description: 'Wrapped notes and expandable content, measured as they appear.',
    detail: 'Automatic row measurement · sparse height cache · anchored position',
    action: 'expand',
    seconds: 5,
    index: 73_499_999,
  },
  {
    id: 'compare',
    dataset: 'signal',
    label: 'Explore, compare, decide',
    title: 'Two ranges.\nOne closer look.',
    description: 'Select a range, pin it, then compare with a second part of the dataset.',
    detail: 'Provider summaries · linked relative position · saved views',
    action: 'compare',
    seconds: 6,
    index: 73_499_999,
  },
];
