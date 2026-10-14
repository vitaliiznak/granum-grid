import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { openParquetFile } from '@granum/parquet';
import {
  formatBytes,
  parquet,
  parquetDataset,
  parquetDetails,
  type TransferMeter,
} from './datasets/parquet';
import { formatCount, type DemoDataset } from './datasets/types';

/** Read a Parquet URL's footer and build its dataset. */
export async function openParquetDataset(url: string, signal: AbortSignal) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Enter a full http:// or https:// address.');
  }
  if (!/^https?:$/.test(parsed.protocol))
    throw new Error('Enter a full http:// or https:// address.');
  try {
    const { file, transfer } = await openParquetFile(parsed.href, signal);
    return parquetDataset(file, transfer);
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof TypeError)
      throw new Error(
        'Could not read this URL. The server must allow cross-origin reads (CORS) and byte ranges; public files on Hugging Face, S3, and R2 usually do.',
      );
    if (error instanceof Error && /footer|PAR1|magic/i.test(error.message))
      throw new Error(`This does not look like a Parquet file (${error.message}).`);
    throw error;
  }
}

function Downloaded({ meter }: { meter: TransferMeter }) {
  const { requests, bytes } = useSyncExternalStore(meter.subscribe, meter.get);
  return (
    <span data-testid="parquet-transfer">
      Downloaded {formatBytes(bytes)} in {formatCount(requests)}{' '}
      {requests === 1 ? 'request' : 'requests'}
    </span>
  );
}

export function ParquetImport({
  dataset,
  initialUrl,
  onLoad,
  linkToRow,
}: {
  dataset: DemoDataset;
  /** A file to open on mount, such as the `url` of a shared link. */
  initialUrl: string | null;
  onLoad(dataset: DemoDataset): void;
  /** A link that opens this file at the current row and selection. */
  linkToRow?(): string | null;
}) {
  const [link, setLink] = useState<{ href: string; copied: boolean } | null>(null);
  const info = parquetDetails(dataset.provider);
  const [url, setUrl] = useState(initialUrl ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  const open = async (target: string) => {
    pending.current?.abort();
    const controller = (pending.current = new AbortController());
    setError('');
    setBusy(true);
    try {
      const next = await openParquetDataset(target.trim(), controller.signal);
      if (!controller.signal.aborted) onLoad(next);
    } catch (error) {
      if (!controller.signal.aborted)
        setError(error instanceof Error ? error.message : 'Could not read this file.');
    } finally {
      if (pending.current === controller) setBusy(false);
    }
  };
  useEffect(() => {
    // Open a shared link's file once per mount; later files wait for the form.
    if (initialUrl && info?.url !== initialUrl) void open(initialUrl);
    return () => pending.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="trace-import parquet-import">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void open(url);
        }}
      >
        <input
          type="url"
          required
          aria-label="Parquet file URL"
          placeholder="https://…/file.parquet"
          value={url}
          onChange={(event) => setUrl(event.currentTarget.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Reading footer…' : 'Open Parquet URL'}
        </button>
        {!info?.bundled && (
          <button
            type="button"
            onClick={() => {
              pending.current?.abort();
              setBusy(false);
              setError('');
              onLoad(parquet);
            }}
          >
            Restore FineWeb
          </button>
        )}
      </form>
      {info && (
        <span>
          {formatCount(info.rowGroups)} row groups · {formatBytes(info.byteLength)} ·{' '}
          <Downloaded meter={info.meter} />
        </span>
      )}
      <span>Read with HTTP range requests · needs CORS · nothing is uploaded</span>
      {linkToRow && (
        <span className="row-link">
          <button
            type="button"
            onClick={() => {
              const href = linkToRow();
              if (!href) return;
              setLink({ href, copied: false });
              // The address stays in the field when the clipboard is unavailable.
              navigator.clipboard?.writeText(href).then(
                () => setLink({ href, copied: true }),
                () => {},
              );
            }}
          >
            Link to this row
          </button>
          {link && (
            <>
              <input
                readOnly
                aria-label="Link to this row"
                value={link.href}
                onFocus={(event) => event.currentTarget.select()}
              />
              {link.copied && <span role="status">Copied</span>}
            </>
          )}
        </span>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
