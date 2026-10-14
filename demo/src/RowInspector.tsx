import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { RowActivationContext } from 'granum-grid';
import './row-inspector.css';

/** A host-owned, non-modal inspector: the grid remains available beside it. */
export function RowInspector({
  record,
  children,
  onClose,
  className,
  copyLabel = 'Row as JSON',
}: {
  record: RowActivationContext<unknown>;
  children: ReactNode;
  onClose(): void;
  className?: string;
  /** Shown until the reader copies or the copy fails. */
  copyLabel?: string;
}) {
  const titleId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('dialog[open]')
      )
        return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [onClose]);
  return (
    <aside
      className={`row-inspector${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-labelledby={titleId}
      data-ds-native-scroll=""
    >
      <header>
        <div>
          <span className="inspector-eyebrow">Record inspector</span>
          <h2 ref={title} id={titleId} tabIndex={-1}>
            Row details
          </h2>
          <span className="inspector-row-number">
            Row {record.rowNumber.toLocaleString('en-US')}
          </span>
        </div>
        <button className="inspector-close" aria-label="Close row details" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="inspector-content">{children}</div>
      <footer>
        <button
          className="inspector-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(record.row, null, 2));
              setCopy('copied');
            } catch {
              setCopy('failed');
            }
          }}
        >
          Copy record
        </button>
        <span role="status">
          {copy === 'copied'
            ? 'Copied JSON'
            : copy === 'failed'
              ? 'Could not copy. Try again.'
              : copyLabel}
        </span>
      </footer>
    </aside>
  );
}
