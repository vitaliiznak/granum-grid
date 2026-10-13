import { useEffect, useId, useRef, useState } from 'react';
import { validRange } from '../core/exploration.js';
import type { RowRange } from '../data/types.js';

export const rangeAddress = (range: RowRange) =>
  range.end - range.start === 1
    ? `Row ${range.end.toLocaleString()}`
    : `Rows ${(range.start + 1).toLocaleString()}–${range.end.toLocaleString()}`;

export const rangeCount = (range: RowRange) => {
  const count = range.end - range.start;
  return `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`;
};

/** The same choice of input methods is used for a selection and a comparison. */
export function RangePicker({
  rowCount,
  initialRange,
  excludedRange,
  title,
  getVisibleRange,
  onSelect,
  onMap,
  onCancel,
}: {
  rowCount: number;
  initialRange: RowRange | null;
  excludedRange?: RowRange | null;
  title: string;
  getVisibleRange(): RowRange;
  onSelect(range: RowRange): void;
  onMap(): void;
  onCancel(): void;
}) {
  const [manual, setManual] = useState(false);
  const [initial] = useState(() => initialRange ?? getVisibleRange());
  const [start, setStart] = useState(String(initial.start + 1));
  const [end, setEnd] = useState(String(initial.end));
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const errorId = useId();
  const range = {
    start: Number(start.replaceAll(',', '')) - 1,
    end: Number(end.replaceAll(',', '')),
  };
  const valid = validRange(range, rowCount);
  useEffect(() => {
    if (manual) input.current?.focus();
  }, [manual]);
  const choose = (next: RowRange) => {
    if (!validRange(next, rowCount)) {
      setError(
        `Enter whole row numbers from 1 to ${rowCount.toLocaleString()}, with the end at or after the start.`,
      );
      return;
    }
    if (excludedRange && next.start === excludedRange.start && next.end === excludedRange.end) {
      setError('Choose different rows. These are already your first range.');
      return;
    }
    onSelect(next);
  };
  return (
    <section
      className="ds-range-picker"
      aria-label={title}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="ds-flow-heading">
        <div>
          <strong>{title}</strong>
          <p id={helpId}>
            {manual
              ? `Choose any rows from 1 to ${rowCount.toLocaleString()}. Both endpoints are included.`
              : 'How would you like to choose them?'}
          </p>
        </div>
        <button className="ds-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {manual ? (
        <form
          className="ds-range-form"
          onSubmit={(event) => {
            event.preventDefault();
            choose(range);
          }}
        >
          <div className="ds-range-inputs">
            <label>
              From row
              <input
                ref={input}
                className="ds-input"
                inputMode="numeric"
                aria-describedby={error ? `${helpId} ${errorId}` : helpId}
                aria-invalid={!!error}
                value={start}
                onChange={(event) => {
                  setStart(event.target.value);
                  setError('');
                }}
              />
            </label>
            <span aria-hidden="true">→</span>
            <label>
              To row
              <input
                className="ds-input"
                inputMode="numeric"
                aria-describedby={error ? `${helpId} ${errorId}` : helpId}
                aria-invalid={!!error}
                value={end}
                onChange={(event) => {
                  setEnd(event.target.value);
                  setError('');
                }}
              />
            </label>
          </div>
          <div className="ds-range-confirm">
            <span aria-live="polite">
              {valid ? `${rangeCount(range)} in this selection` : 'Enter a valid range to continue'}
            </span>
            <button className="ds-button ds-flow-primary" type="submit" disabled={!rowCount}>
              Use these rows
            </button>
            <button
              className="ds-button"
              type="button"
              onClick={() => {
                setManual(false);
                setError('');
              }}
            >
              Other ways to select
            </button>
          </div>
        </form>
      ) : (
        <div className="ds-selection-methods">
          <button
            className="ds-button ds-selection-method"
            disabled={!rowCount}
            onClick={() => choose(getVisibleRange())}
          >
            <strong>Rows on screen</strong>
            <span>Use the rows currently in view.</span>
          </button>
          <button className="ds-button ds-selection-method" disabled={!rowCount} onClick={onMap}>
            <strong>Draw on map</strong>
            <span>Drag over a part of the dataset.</span>
          </button>
          <button
            className="ds-button ds-selection-method"
            disabled={!rowCount}
            onClick={() => setManual(true)}
          >
            <strong>Enter row numbers</strong>
            <span>Choose an exact start and end.</span>
          </button>
        </div>
      )}
      {error && (
        <p id={errorId} className="ds-form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
