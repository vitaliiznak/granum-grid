import { GENES } from '../../demo/src/data/genome';
import { INCIDENTS, LOG_COUNT } from '../../demo/src/data/logs';
import { MARKET_EVENTS, TRADE_COUNT } from '../../demo/src/data/market';
import { NAMED_STARS } from '../../demo/src/data/stars';

export type Action =
  'scroll' | 'jump' | 'overview' | 'search' | 'expand' | 'compare' | 'history' | 'select' | 'save';
export interface Scene {
  id: string;
  dataset: string;
  label: string;
  title: string;
  headline: string;
  promise: string;
  description: string;
  detail: string;
  features: [string, string, string];
  action: Action;
  seconds: number;
  index?: number;
  target?: number;
  /** Text typed into "Go to…" by a `jump` scene; its first result must be `target`. */
  query?: string;
  theme?: 'light' | 'dark';
}

// Copy, order and timing live here. All counts, records and landmarks come from the demo.
export const scenes: Scene[] = [
  {
    id: 'hero',
    dataset: 'signal',
    label: 'Signal archive',
    title: 'Explore 100 million synthetic readings. Load only nearby pages.',
    headline: 'Millions of rows. A clear way through.',
    promise: 'Turn a wall of numbers into a navigable workspace, with a visual map of the data.',
    description: 'Scroll the signal archive near row 73,500,000.',
    detail: '100 million synthetic readings. Rows generated on demand.',
    features: ['On-demand pages', 'Bounded rendering', 'Dataset map'],
    action: 'scroll',
    seconds: 7,
    index: 73_499_994,
  },
  {
    id: 'jump',
    dataset: 'signal',
    label: 'Exact row navigation',
    title: 'Go directly to row 73,500,000.',
    headline: 'Skip the endless scroll.',
    promise: 'Enter a row or a familiar name. Reach the record without dragging through millions.',
    description: 'Type an address. Travel through the overview. Land on an exact row.',
    detail: 'Exact addresses · reversible jumps · keyboard navigation',
    features: ['Exact row addresses', 'Named destinations', 'Keyboard controls'],
    action: 'jump',
    seconds: 9,
    index: 0,
    target: 73_499_999,
    query: '73,500,000',
  },
  {
    id: 'history',
    dataset: 'signal',
    label: 'Navigation history',
    title: 'Jump to a new location, go back, then move forward again.',
    headline: 'Explore freely. Find your way back.',
    promise: 'Follow an interesting lead. One click brings you back to where you started.',
    description: 'Jump away, return to the previous location, then move forward.',
    detail: 'Generated signal archive · navigation history within the explorer',
    features: ['Back', 'Forward', 'Restored position'],
    action: 'history',
    seconds: 11,
    index: 999_999,
    target: 73_499_999,
  },
  {
    id: 'overview',
    dataset: 'signal',
    label: 'Overview',
    title: 'Zoom out to sampled summaries of the dataset.',
    headline: 'Make the big picture clear.',
    promise: 'Zoom out. See how regions differ. Choose where to look closer.',
    description: 'Zoom out to regional summaries. Keep the dataset map in view.',
    detail: 'Sampled summaries are labeled as estimates.',
    features: ['Fit the dataset', 'Regional summaries', 'Visible accuracy labels'],
    action: 'overview',
    seconds: 8,
    index: 49_999_999,
  },
  {
    id: 'genome',
    dataset: 'genome',
    label: 'Genome / BRCA1',
    title: 'Jump to BRCA1 in a 3.1-billion-row synthetic genome.',
    headline: 'Complex data. Familiar landmarks.',
    promise: 'Use the language your users know. A gene name becomes a destination.',
    description: 'Custom rows, chromosome chapters, and gene landmarks.',
    detail: 'Synthetic sequence · GRCh38 chromosome lengths · approximate gene positions',
    features: ['Chromosome chapters', 'Gene landmarks', 'Custom rows'],
    action: 'jump',
    seconds: 8,
    index: 10_000,
    target: GENES.find((gene) => gene.name === 'BRCA1')!.index,
    query: 'BRCA1',
  },
  {
    id: 'logs',
    dataset: 'logs',
    label: 'Log search',
    title: 'Search for status >= 500, then inspect a matching log entry.',
    headline: 'Find a match. See the context.',
    promise: 'Open a matching log and see the records around it. Keep investigating from there.',
    description: 'Let your provider search. Keep matches connected to the surrounding records.',
    detail: 'Generated logs · bounded sample search · no full browser scan',
    features: ['Provider search', 'Predicate queries', 'Partial results labeled'],
    action: 'search',
    seconds: 10,
    index: Math.round(INCIDENTS[2].x * (LOG_COUNT - 1)),
  },
  {
    id: 'market',
    dataset: 'market',
    label: 'Market events',
    title: 'Navigate to a named event in the market tape.',
    headline: 'Go where the story is.',
    promise: 'Turn important moments into landmarks. Take users straight to the event.',
    description: 'A market tape with custom cells, named events, and a map of the price profile.',
    detail: '750 million generated trades · illustrative prices',
    features: ['Named events', 'Custom cells', 'Price overview'],
    action: 'jump',
    seconds: 8,
    index: 10_000,
    target: Math.round(MARKET_EVENTS[0].x * (TRADE_COUNT - 1)),
    query: 'Flash crash',
  },
  {
    id: 'stars',
    dataset: 'stars',
    label: 'Star catalog / dark theme',
    title: 'Find Sirius in a custom-rendered, dark-themed catalog.',
    headline: 'Your data. Your universe.',
    promise: 'Build an explorer that feels native to your product, from its rows to its theme.',
    description: 'Custom renderers and a dark theme, with the same navigation underneath.',
    detail: 'Synthetic catalog · named-star landmarks · 1.8 billion row addresses',
    features: ['Custom renderers', 'Dark theme', 'Domain landmarks'],
    action: 'jump',
    seconds: 8,
    theme: 'dark',
    index: NAMED_STARS[0].index,
    target: NAMED_STARS.find((star) => star.name === 'Sirius')!.index,
    query: 'Sirius',
  },
  {
    id: 'dynamic',
    dataset: 'signal',
    label: 'Expandable rows',
    title: 'Expand a record. Row heights adjust automatically.',
    headline: 'Give every detail room.',
    promise: 'Put notes and rich details where the investigation is already happening.',
    description: 'Wrapped notes and expandable content, measured as they appear.',
    detail: 'Automatic row measurement · sparse height cache · anchored position',
    features: ['Expandable content', 'Measured row heights', 'Position anchoring'],
    action: 'expand',
    seconds: 8,
    index: 73_499_999,
  },
  {
    id: 'selection',
    dataset: 'signal',
    label: 'Range selection',
    title: 'Select 101 rows and open their sampled summary.',
    headline: 'From rows to useful information.',
    promise: 'Select what matters. See the average, lowest, and highest readings in one summary.',
    description: 'Enter a range and reveal its provider-supplied statistics.',
    detail: 'Generated readings · range statistics are sampled estimates',
    features: ['Exact range selection', 'Provider statistics', 'Selection actions'],
    action: 'select',
    seconds: 10,
    index: 73_499_999,
  },
  {
    id: 'compare',
    dataset: 'signal',
    label: 'Compare ranges',
    title: 'Compare two ranges with linked relative scrolling.',
    headline: 'Make differences visible.',
    promise: 'Bring two distant ranges side by side. Scroll together and inspect the differences.',
    description: 'Select a range, pin it, then compare with a second part of the dataset.',
    detail: 'Provider summaries · linked relative position · bookmarks',
    features: ['Side-by-side ranges', 'Linked scrolling', 'Provider summaries'],
    action: 'compare',
    seconds: 12,
    index: 73_499_999,
  },
  {
    id: 'saved',
    dataset: 'signal',
    label: 'Bookmarks',
    title: 'Bookmark a location, navigate away, and return to it.',
    headline: 'Pick up where you left off.',
    promise:
      'Bookmark a useful location. Return to the investigation without rebuilding your context.',
    description: 'Save a bookmark, jump elsewhere, and return to the saved location.',
    detail: 'Bookmarks are stored in this browser and scoped to the dataset revision.',
    features: ['Named bookmarks', 'Restored context', 'Dataset-aware storage'],
    action: 'save',
    seconds: 12,
    index: 73_499_999,
    target: 999_999,
  },
];
