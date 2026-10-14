import {
  estimatedRowCount,
  hackerNewsProvider,
  timeLabel,
  type HackerNewsItem,
} from '../data/hackernews';
import { NewsIcon } from './icons';
import { compact, formatCount, showAll, type DemoDataset } from './types';

const provider = hackerNewsProvider(estimatedRowCount());
const itemUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;
const TYPE_LABELS: Record<string, string> = {
  story: 'Story',
  comment: 'Comment',
  job: 'Job',
  poll: 'Poll',
  pollopt: 'Poll option',
};

export const hackernews: DemoDataset<HackerNewsItem> = {
  id: 'hackernews',
  name: 'Hacker News (live)',
  unit: 'items',
  title: 'Every Hacker News item',
  description:
    'Every story, comment, job, and poll posted to Hacker News since October 2006, one row per item ID. Items arrive on demand from the official public API; nothing is generated.',
  facts: ['1 row per item', 'since 2006-10-09', 'HN API + Algolia'],
  icon: <NewsIcon />,
  origin: 'real',
  provider,
  // One request per item: small pages keep the first screen to a few dozen requests.
  cache: { pageSize: 50 },
  async grow(signal) {
    const next = await provider.refresh(signal);
    return next === provider ? hackernews : { ...hackernews, provider: next };
  },
  ariaLabel: 'Hacker News items',
  rowHeight: 38,
  bytesPerRow: 480,
  sourceLabel: 'Hacker News API',
  sourceNote:
    'Live data from the official Hacker News API (one request per item) and Algolia’s public HN search index, requested directly by this page without a key. Points and comment counts are as of when each page of rows loaded.',
  summaryBucketSizes: [
    { label: '100 items', rows: 100 },
    { label: '1,000 items', rows: 1000 },
    { label: '10,000 items', rows: 10_000 },
    { label: '100,000 items', rows: 100_000 },
    { label: '1M items', rows: 1_000_000 },
  ],
  formatBucketSize: (rows) => `${formatCount(rows)} ${rows === 1 ? 'item' : 'items'}`,
  task: {
    title: 'Find the most upvoted story, then read what else was posted that minute.',
    action: 'See all twenty years',
    run: showAll,
  },
  atlas: { axisLabel: 'Year', formatValue: (v) => `${compact(v)}/h` },
  map: {
    chapters: 'Years',
    profile: 'Activity + top stories',
    tracks: 'Show extra tracks',
    explain:
      'Down follows item IDs, which Hacker News assigns in posting order. Right means more items posted per hour.',
    sampling:
      'Each map group reads the posting times of its first item and the next group’s first item, so the rate is exact for the group; it has no per-item range.',
  },
  header: (
    <>
      <span className="hn-col-id">Item</span>
      <span className="hn-col-time">Posted (UTC)</span>
      <span className="hn-col-type">Type</span>
      <span className="hn-col-by">By</span>
      <span className="hn-col-text">Title or comment</span>
      <span className="hn-col-score">Points</span>
      <span className="hn-col-replies">Comments</span>
    </>
  ),
  tour: [
    {
      feature: 'Flight',
      label: 'Fly to the top story',
      hint: 'Found from the data: Algolia ranks every story by points; the most upvoted is a marker.',
      run: async ({ controller }) => {
        const markers = await provider.loadMarkers(new AbortController().signal);
        const top = markers.find((marker) => marker.id === 'top');
        if (top) controller.goTo(top.index);
      },
    },
    {
      feature: 'Search',
      label: 'Search for Rust',
      hint: 'Full-text search runs on Algolia’s index and lands on real item IDs.',
      run: ({ search }) => search('rust'),
    },
    {
      feature: 'Dates',
      label: 'Jump to 12 March 2020',
      hint: 'Type any date — 2020, 2020-03, or 2020-03-12 — and press Enter. Algolia finds the first item posted then.',
      run: ({ search }) => search('2020-03-12'),
    },
    {
      feature: 'Markers',
      label: 'Next landmark story',
      hint: 'Markers are the most upvoted and most discussed stories. N and P step between them.',
      run: ({ controller }) => controller.nextMarker(),
    },
    {
      feature: 'Zoom',
      requiredView: 'zoom',
      label: 'Twenty years at once',
      hint: 'Each summary reads a few item times, so any range costs a bounded number of requests.',
      run: ({ fit }) => fit(),
    },
  ],
  renderRow: ({ row }) => {
    const id = (
      <span role="gridcell" className="hn-id">
        <a
          href={itemUrl(row.id)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open item ${formatCount(row.id)} on Hacker News`}
        >
          {formatCount(row.id)}
        </a>
      </span>
    );
    if (row.missing)
      return (
        <>
          {id}
          <span role="gridcell" className="hn-missing">
            No item returned (not posted yet, or not served)
          </span>
        </>
      );
    const time = timeLabel(row.time);
    const hidden = row.deleted ? '[deleted]' : row.dead ? '[dead]' : null;
    const content = row.title || row.text;
    return (
      <>
        {id}
        <span role="gridcell" className="hn-time">
          {time.slice(0, 10)} <span>{time.slice(11)}</span>
        </span>
        <span role="gridcell" className="hn-type" data-type={row.type}>
          {TYPE_LABELS[row.type]}
        </span>
        <span role="gridcell" className="hn-by">
          {row.by || '—'}
        </span>
        <span
          role="gridcell"
          className="hn-text"
          data-kind={row.title ? 'title' : 'text'}
          title={hidden ? undefined : content}
        >
          {/* Dead items are hidden on Hacker News by default; so is their text here. */}
          {hidden ? <em>{hidden}</em> : content || '—'}
        </span>
        <span role="gridcell" className="hn-score">
          {row.score === null ? '—' : formatCount(row.score)}
        </span>
        <span role="gridcell" className="hn-replies">
          {row.descendants !== null
            ? formatCount(row.descendants)
            : row.replies
              ? `${formatCount(row.replies)} ${row.replies === 1 ? 'reply' : 'replies'}`
              : '—'}
        </span>
      </>
    );
  },
};
