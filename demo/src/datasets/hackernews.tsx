import {
  estimatedRowCount,
  hackerNewsProvider,
  httpHost,
  type HackerNewsItem,
  type ItemParagraph,
  type ItemPart,
} from '../data/hackernews';
import { secondLabel } from '../data/remote';
import { NewsIcon } from './icons';
import { compact, jumpToMarker, formatCount, inspectLatest, type DemoDataset } from './types';

const provider = hackerNewsProvider(estimatedRowCount());
const itemUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;
const userUrl = (by: string) => `https://news.ycombinator.com/user?id=${encodeURIComponent(by)}`;
const TYPE_LABELS: Record<string, string> = {
  story: 'Story',
  comment: 'Comment',
  job: 'Job',
  poll: 'Poll',
  pollopt: 'Poll option',
};
type LoadedItem = Extract<HackerNewsItem, { missing: false }>;

function replyCount(row: LoadedItem) {
  return row.descendants !== null ? row.descendants : row.replies;
}
function replyCaption(row: LoadedItem) {
  const count = replyCount(row);
  const noun =
    row.descendants !== null
      ? count === 1
        ? 'comment'
        : 'comments'
      : count === 1
        ? 'reply'
        : 'replies';
  return `${formatCount(count)} ${noun}`;
}
function ItemRun({ part }: { part: ItemPart }) {
  return part.href ? (
    <a href={part.href} title={part.href} target="_blank" rel="noreferrer">
      {part.text}
    </a>
  ) : (
    <span>{part.text}</span>
  );
}
function ItemText({ paragraphs }: { paragraphs: ItemParagraph[] }) {
  return (
    <div className="hn-detail-body">
      {paragraphs.map((paragraph, index) => {
        const runs = paragraph.parts.map((part, partIndex) => (
          <ItemRun key={partIndex} part={part} />
        ));
        return paragraph.code ? (
          <pre key={index} className="hn-code">
            {runs}
          </pre>
        ) : (
          <p key={index}>{runs}</p>
        );
      })}
    </div>
  );
}
function ItemJump({ id, show }: { id: number; show(index: number): void }) {
  return (
    <button type="button" className="hn-thread-jump" onClick={() => show(id - 1)}>
      Item {formatCount(id)}
    </button>
  );
}
function ItemDetails({ row, show }: { row: HackerNewsItem; show(index: number): void }) {
  if (row.missing)
    return <p>No item returned for this id. It may not have been posted yet, or not served.</p>;
  const hidden = row.deleted ? 'deleted' : row.dead ? 'dead' : null;
  return (
    <div className="hn-detail">
      <p className="inspector-market">
        {TYPE_LABELS[row.type]} · item {formatCount(row.id)}
      </p>
      <p className="inspector-timestamp">
        <time dateTime={new Date(row.time).toISOString()}>{secondLabel(row.time)} UTC</time>
        {row.by && (
          <>
            {' '}
            ·{' '}
            <a href={userUrl(row.by)} target="_blank" rel="noreferrer">
              {row.by}
            </a>
          </>
        )}
      </p>
      {row.title && <h3 className="hn-detail-title">{row.title}</h3>}
      {row.url && (
        <p className="hn-detail-url">
          <a href={row.url} target="_blank" rel="noreferrer">
            {httpHost(row.url)}
          </a>
        </p>
      )}
      {hidden ? (
        <p>This item is {hidden}. Hacker News hides its text, and so does this row.</p>
      ) : row.body.length ? (
        <>
          <ItemText paragraphs={row.body} />
          {row.textTruncated && (
            <p className="hn-detail-note">The rest of this text was not kept with the row.</p>
          )}
        </>
      ) : (
        !row.title && <p className="hn-detail-note">This item has no text.</p>
      )}
      {!hidden && row.links.length > 0 && (
        <>
          <h3 className="hn-detail-heading">Links</h3>
          <ul className="hn-links">
            {row.links.map((link, index) => (
              <li key={`${link.href}:${index}`}>
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
                {link.label !== link.href && <span>{link.href}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3 className="hn-detail-heading">Thread</h3>
      <dl className="inspector-fields">
        <div>
          <dt>Parent</dt>
          <dd>
            {row.parent !== null ? (
              <ItemJump id={row.parent} show={show} />
            ) : (
              <span>None. This item starts a thread.</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Replies</dt>
          <dd>
            {row.kids.length === 0 ? (
              <span>No direct replies.</span>
            ) : (
              <div className="hn-reply-list">
                {row.kids.map((id) => (
                  <ItemJump key={id} id={id} show={show} />
                ))}
              </div>
            )}
          </dd>
        </div>
      </dl>
      {row.replies > row.kids.length && (
        <p className="hn-detail-note">
          Showing {formatCount(row.kids.length)} of {formatCount(row.replies)} direct replies. The
          rest stay on{' '}
          <a href={itemUrl(row.id)} target="_blank" rel="noreferrer">
            Hacker News
          </a>
          .
        </p>
      )}
      <h3 className="hn-detail-heading">Metadata</h3>
      <dl className="inspector-fields">
        {(
          [
            ['Type', TYPE_LABELS[row.type]],
            ['Author', row.by || '—'],
            ['Points', row.score === null ? '—' : formatCount(row.score)],
            ...(row.descendants === null ? [] : [['Comments', formatCount(row.descendants)]]),
            ['Direct replies', formatCount(row.replies)],
            ...(hidden ? [['Status', hidden]] : []),
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="inspector-source">
        Source: Hacker News item {formatCount(row.id)}. Points and reply ids are from when this row
        loaded.{' '}
        <a href={itemUrl(row.id)} target="_blank" rel="noreferrer">
          Open on Hacker News
        </a>
        .
      </p>
    </div>
  );
}

export const hackernews: DemoDataset<HackerNewsItem> = {
  id: 'hackernews',
  name: 'Hacker News (live)',
  unit: 'items',
  title: 'Every Hacker News item',
  description:
    'Every story, comment, job, and poll posted to Hacker News since October 2006, one row per item ID. Items arrive on demand from the official public API; nothing is generated. Open a row to read its text, links, and the parent and replies.',
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
  rowHeight: 64,
  bytesPerRow: 1200,
  sourceLabel: 'Hacker News API',
  sourceNote:
    'Live data from the official Hacker News API (one request per item) and Algolia’s public HN search index, requested directly by this page without a key. Points and comment counts are as of when each page of rows loaded.',
  task: {
    title: 'Find the most upvoted story, then read what else was posted that minute.',
    action: 'Inspect latest rows',
    run: inspectLatest,
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
      <span
        className="hn-col-replies"
        title="Comments in a story, or direct replies on any other item"
      >
        Replies
      </span>
    </>
  ),
  tour: [
    {
      feature: 'Jump',
      label: 'Jump to the top story',
      hint: 'Found from the data: Algolia ranks every story by points; the most upvoted is a marker.',
      run: jumpToMarker(provider, 'top'),
    },
    {
      feature: 'Search',
      label: 'Search for Rust',
      hint: 'Full-text search runs on Algolia’s index and lands on real item IDs.',
      run: (api) => api.openSearch('rust'),
    },
    {
      feature: 'Dates',
      label: 'Jump to 12 March 2020',
      hint: 'Type any date — 2020, 2020-03, or 2020-03-12 — and press Enter. Algolia finds the first item posted then.',
      run: (api) => api.openSearch('2020-03-12'),
    },
    {
      feature: 'Markers',
      label: 'Next landmark story',
      hint: 'Markers are the most upvoted and most discussed stories. N and P step between them.',
      run: (api) => api.nextMarker(),
    },
  ],
  inspectorClassName: 'row-inspector-reading dataset-hackernews',
  copyLabel: 'Item as JSON',
  renderDetails: (row, { show }) => <ItemDetails row={row} show={show} />,
  renderRow: ({ row }, { show }) => {
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
    const time = secondLabel(row.time);
    // Dead and deleted items stay in place, but Hacker News hides their text.
    const hidden = row.deleted ? '[deleted]' : row.dead ? '[dead]' : null;
    const content = row.title || row.text;
    const article = row.url ? httpHost(row.url) : null;
    const bodyLinks = hidden ? [] : row.links;
    const firstLink = article ? null : bodyLinks[0];
    const moreLinks = bodyLinks.length - (firstLink ? 1 : 0);
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
        <span role="gridcell" className="hn-text" data-kind={row.title ? 'title' : 'text'}>
          <span className="hn-excerpt" title={hidden ? undefined : content}>
            {hidden ? <em>{hidden}</em> : content || '—'}
          </span>
          <span className="hn-row-meta">
            {row.parent !== null && (
              <button
                type="button"
                className="hn-jump"
                aria-label={`Show parent item ${formatCount(row.parent)}`}
                onClick={() => show(row.parent! - 1)}
              >
                reply to {formatCount(row.parent)}
              </button>
            )}
            {article && (
              <a href={row.url} target="_blank" rel="noreferrer">
                {article}
              </a>
            )}
            {firstLink && (
              <a href={firstLink.href} target="_blank" rel="noreferrer">
                {httpHost(firstLink.href)}
              </a>
            )}
            {moreLinks > 0 && (
              <span>
                {formatCount(moreLinks)} {moreLinks === 1 ? 'link' : 'links'}
              </span>
            )}
            <span className="hn-meta-replies">{replyCaption(row)}</span>
          </span>
        </span>
        <span role="gridcell" className="hn-score">
          {row.score === null ? '—' : formatCount(row.score)}
        </span>
        <span
          role="gridcell"
          className="hn-replies"
          title={
            row.descendants !== null ? `${replyCaption(row)} in this thread` : replyCaption(row)
          }
        >
          {formatCount(replyCount(row))}
        </span>
      </>
    );
  },
};
