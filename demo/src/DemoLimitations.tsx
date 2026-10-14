import { useRef } from 'react';

export function DemoLimitations({
  recording,
  imported,
  live,
  compact = false,
}: {
  recording: boolean;
  imported: boolean;
  /**
   * Rows come from this public third-party API, a Parquet file read over HTTP, or DuckDB in
   * this tab.
   */
  live?: 'binance' | 'hackernews' | 'parquet' | 'sql';
  compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const summary = recording
    ? 'Local recording · up to 100 search results'
    : live === 'binance'
      ? 'Live public API · shared rate limit'
      : live === 'hackernews'
        ? 'Live public API · one request per item'
        : live === 'parquet'
          ? 'Real file over HTTP · one row group per jump'
          : live === 'sql'
            ? 'DuckDB in this tab · each revision is a copy in memory'
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
                : 'Bookmarks stay in this browser. Full-page links restore position and selection for the same recording revision.'}{' '}
              Search input and results are not saved across reloads.
            </p>
          </>
        ) : live === 'sql' ? (
          <>
            <p>
              <strong>A database in this tab.</strong> DuckDB-WASM, about 8 MB, loads the first time
              you open a file or make the sample. It reads your file in place and never uploads it;
              it fetches its Parquet and JSON readers, signed extensions, from
              extensions.duckdb.org. Reloading the page forgets the file, so a link cannot reopen
              it.
            </p>
            <p>
              <strong>What a revision costs.</strong> Each filter or sort copies the matching rows,
              in order, into a table in this tab’s memory. Rows are then a range scan by address,
              the map and summaries are exact, and search checks every row. The last three revisions
              are kept; a large file needs memory for the source and each copy, and browsers cap a
              tab’s WebAssembly memory at 4 GB or less.
            </p>
            <p>
              <strong>Search.</strong> Plain text matches text columns, predicates such as
              <code> latency_ms &gt; 500</code> run as SQL with parameters, and both continue from
              the current row to the end, then from the start. The dialog shows up to 100 matches
              and says when there are more.
            </p>
          </>
        ) : live === 'parquet' ? (
          <>
            <p>
              <strong>A real file, read in place.</strong> The browser reads the Parquet footer
              once, then downloads only the column chunks of the row group that holds the rows in
              view; with a page index, only the pages that hold them. Nothing is generated or
              uploaded, and there is no server of our own. The file’s server must allow byte ranges
              and cross-origin reads (CORS).
            </p>
            <p>
              <strong>What a jump costs.</strong> One row group of compressed data, so the cost
              depends on how the file was written: about 2 MB for the FineWeb file’s 1,000-row
              groups, and far more for a file with one huge row group. Map hover shows summaries
              instead of rows so it never downloads a group. Recently read byte ranges stay cached,
              up to 48 MB.
            </p>
            <p>
              <strong>Map and search.</strong> The map’s band is each row group’s exact min–max from
              the footer’s statistics; its line reads one row group per map group and is marked
              sampled. Go to accepts row numbers and percentages; there is no text search, because
              searching would read the whole file.
            </p>
          </>
        ) : live === 'hackernews' ? (
          <>
            <p>
              <strong>Live third-party data.</strong> Rows come from the official Hacker News API,
              one request per item; search, dates, and markers come from Algolia’s public HN index.
              The demo needs a network connection. Nothing is generated. A row shows a short
              preview; open it to read the loaded text, its links, and the parent and direct
              replies. Deleted and dead items keep their place but show no text, as on Hacker News.
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
              restore position and selection for the same dataset revision. The embedded demo does
              not automatically save your latest position. Search input and results are not saved
              across reloads.
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
