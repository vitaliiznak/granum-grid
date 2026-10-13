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
  headline: string;
  promise: string;
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
    label: 'Signal archive',
    title: 'Explore 100 million synthetic readings. Load only nearby pages.',
    headline: 'Big data. Clear direction.',
    promise: 'A hundred million row addresses. A whole new way to explore.',
    description: 'Scroll the signal archive near row 73,500,000.',
    detail: '100 million synthetic readings. Rows generated on demand.',
    action: 'scroll',
    seconds: 5,
    index: 73_499_994,
  },
  {
    id: 'jump',
    dataset: 'signal',
    label: 'Exact row navigation',
    title: 'Go directly to row 73,500,000.',
    headline: 'Skip the endless scroll.',
    promise: 'Go straight to the row that matters. Keep your place in the bigger picture.',
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
    label: 'Overview',
    title: 'Zoom out to sampled summaries of the dataset.',
    headline: 'See the bigger picture.',
    promise: 'Move from individual records to patterns across your dataset.',
    description: 'Zoom out to regional summaries. Keep the dataset map in view.',
    detail: 'Sampled summaries are labeled as estimates.',
    action: 'overview',
    seconds: 5,
    index: 49_999_999,
  },
  {
    id: 'genome',
    dataset: 'genome',
    label: 'Genome / BRCA1',
    title: 'Jump to BRCA1 in a 3.1-billion-row synthetic genome.',
    headline: 'Billions of rows. A way in.',
    promise: 'Turn familiar names into destinations. Jump straight to BRCA1.',
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
    label: 'Log search',
    title: 'Search for status >= 500, then inspect a matching log entry.',
    headline: 'Find your needle.',
    promise: 'Search through your provider. Explore each match in context.',
    description: 'Let your provider search. Keep matches connected to the surrounding records.',
    detail: 'Generated logs · bounded sample search · no full browser scan',
    action: 'search',
    seconds: 6,
    index: Math.round(INCIDENTS[2].x * (LOG_COUNT - 1)),
  },
  {
    id: 'market',
    dataset: 'market',
    label: 'Market events',
    title: 'Navigate to a named event in the market tape.',
    headline: 'Go where the story is.',
    promise: 'Give important events a name. Make them a place you can go.',
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
    label: 'Star catalog / dark theme',
    title: 'Find Sirius in a custom-rendered, dark-themed catalog.',
    headline: 'Your data. Your universe.',
    promise: 'Bring your own rows, renderers, and style. Make the experience yours.',
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
    label: 'Focus + context',
    title: 'Keep nearby rows readable while compressing distant context.',
    headline: 'Get closer. Keep context.',
    promise: 'Bring the detail into focus without losing what surrounds it.',
    description: 'Full-size detail near your focus. Compressed context around it.',
    detail: 'List · Focus + context · Overview',
    action: 'lens',
    seconds: 5,
    index: 73_499_999,
  },
  {
    id: 'dynamic',
    dataset: 'signal',
    label: 'Expandable rows',
    title: 'Expand a record. Row heights adjust automatically.',
    headline: 'Give every detail room.',
    promise: 'Open a record. Let the layout move with your content.',
    description: 'Wrapped notes and expandable content, measured as they appear.',
    detail: 'Automatic row measurement · sparse height cache · anchored position',
    action: 'expand',
    seconds: 5,
    index: 73_499_999,
  },
  {
    id: 'compare',
    dataset: 'signal',
    label: 'Compare ranges',
    title: 'Compare two ranges with linked relative scrolling.',
    headline: 'Two places. One perspective.',
    promise: 'Bring distant ranges together. Explore them side by side.',
    description: 'Select a range, pin it, then compare with a second part of the dataset.',
    detail: 'Provider summaries · linked relative position · saved views',
    action: 'compare',
    seconds: 6,
    index: 73_499_999,
  },
];
