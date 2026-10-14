import { useRef } from 'react';

export function DemoLimitations({
  recording,
  imported,
  live,
  compact = false,
}: {
  recording: boolean;
  imported: boolean;
  /** Rows come from this public third-party API. */
  live?: 'binance' | 'hackernews';
  compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const summary = recording
    ? 'Local recording · up to 100 search results'
    : live === 'binance'
      ? 'Live public API · shared rate limit'
      : live === 'hackernews'
        ? 'Live public API · one request per item'
        : 'Generated data · search may miss matches';
  return (
    <aside className={`demo-limitations${compact ? ' demo-limitations-compact' : ''}`}>
      {!compact && (
        <p>
          <strong>Demo limitations</strong> {summary}.
          {!recording && !live && ' Your own provider can search the full dataset on a server.'}
        </p>
      )}
      <button
        className={compact ? 'ds-button' : 'text-button'}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
      >
        {compact ? `Demo limits: ${summary.toLowerCase()}` : 'About these limits'}
      </button>
      <dialog ref={dialog} className="demo-limitations-dialog" aria-label="Demo limitations">
        <div className="demo-limitations-heading">
          <h2>Demo limitations</h2>
          <button className="ds-button" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        {recording ? (
          <>
            <p>
              <strong>Local recording.</strong> This example holds the supported events in browser
              memory. Summaries are exact for those events. Search checks the recording and reports
              when results are truncated; the search dialog shows up to 100 matches.
            </p>
            <p>
              <strong>Returning later.</strong>{' '}
              {imported
                ? 'Imported files and their bookmarks last only for this session. Reloading returns to the bundled recording; import your file again to explore it.'
                : 'Bookmarks stay in this browser. Full-page links restore position, zoom, and selection for the same recording revision.'}{' '}
              Search input and results are not saved across reloads.
            </p>
          </>
        ) : live === 'hackernews' ? (
          <>
            <p>
              <strong>Live third-party data.</strong> Rows come from the official Hacker News API,
              one request per item; search, dates, and markers come from Algolia’s public HN index.
              The demo needs a network connection. Nothing is generated. Deleted and dead items keep
              their place but show no text, as on Hacker News.
            </p>
            <p>
              <strong>Request volume.</strong> A screen of rows costs about 50 small requests, and
              every summary reads one item time per group, at most 24 requests at a time. A search,
              date jump, or marker load is one or two Algolia requests; Algolia may refuse an
              address that sends too many.
            </p>
            <p>
              <strong>Summaries and search.</strong> Activity is items posted per hour, exact for
              each group but without a per-item range. Search returns Algolia’s top-ranked matches
              from your position, not every match, and Algolia does not index deleted or dead items.
              Row addresses are item IDs, so bookmarks and links keep working while later visits add
              rows.
            </p>
          </>
        ) : live ? (
          <>
            <p>
              <strong>Live third-party data.</strong> Rows, summaries, and markers come from
              Binance’s public market-data API on demand. The demo needs a network connection, and
              Binance refuses some regions. Nothing is generated; seconds without a published candle
              appear as gaps.
            </p>
            <p>
              <strong>Rate limit.</strong> Binance allows 6,000 request weight per minute per
              address. The demo spends at most half and pauses every request when Binance answers
              with a rate-limit error, so rows may wait or fail until the pause ends.
            </p>
            <p>
              <strong>Summaries and search.</strong> Summaries use the coarsest candles that fit:
              exact when whole candles tile a group, otherwise estimated. Price searches find the
              first matching seconds from your position, not every match. Row addresses are fixed
              seconds, so bookmarks and links keep working while later visits add rows.
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>Generated on demand.</strong> The same row address produces the same data
              while the generator is unchanged. Billions of rows are not downloaded or stored.
              Request delays simulate a server; they do not measure a real backend.
            </p>
            <p>
              <strong>Search can miss matches.</strong> General searches check a bounded sample and
              return verified matches, not every match. The sample depends on your current position.
              Zero sampled matches does not mean none exist. Row and date jumps use direct
              addresses; overview summaries use sampled estimates.
            </p>
            <p>
              <strong>Returning later.</strong> Bookmarks stay in this browser. Full-page links
              restore position, zoom, and selection for the same dataset revision. The embedded demo
              does not automatically save your latest position. Search input and results are not
              saved across reloads.
            </p>
          </>
        )}
        <p>
          <strong>With your own data.</strong> The library can request pages, complete searches, and
          exact summaries from your server without loading the whole dataset in the browser. The
          built-in search dialog currently shows up to 100 matches; browsing more requires custom
          search controls. Your application decides what to persist.
        </p>
      </dialog>
    </aside>
  );
}
