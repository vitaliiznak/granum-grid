import type { GranumGridEngine } from '../core/engine.js';
import type { RowMeasurement } from '../core/rowSizes.js';

export interface RowMeasurements {
  /** A stable ref callback for the element of row `index`. */
  ref(index: number): (element: HTMLElement | null) => void;
  /** Measure rows attached since the last flush, before paint. */
  flush(): void;
  /** Measure every attached row on the next frame. */
  measure(): void;
  start(): void;
  stop(): void;
}

/**
 * One ResizeObserver and one batched engine update for every mounted row, however many.
 * Newly attached rows are measured synchronously by `flush`, before paint, so they never
 * show at estimated positions; later size changes arrive on the next frame.
 */
export function createRowMeasurements(engine: GranumGridEngine): RowMeasurements {
  const elements = new Map<number, HTMLElement>();
  const indices = new WeakMap<Element, number>();
  const refs = new Map<number, (element: HTMLElement | null) => void>();
  const pending = new Map<number, number>();
  /** Rows attached by the current commit and not yet measured. */
  const attached = new Set<number>();
  let observer: ResizeObserver | undefined;
  let frame = 0;
  const schedule = (index: number, height: number) => {
    pending.set(index, height);
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        engine.measureRows(
          [...pending]
            .filter(([index]) => elements.has(index))
            .map(([index, height]) => ({ index, height })),
          [...elements.keys()],
        );
        pending.clear();
      });
  };
  return {
    ref(index) {
      let ref = refs.get(index);
      if (!ref) {
        ref = (element) => {
          const old = elements.get(index);
          if (old) observer?.unobserve(old);
          if (element) {
            elements.set(index, element);
            indices.set(element, index);
            attached.add(index);
            refs.set(index, ref!);
            observer?.observe(element, { box: 'border-box' });
          } else {
            elements.delete(index);
            refs.delete(index);
            pending.delete(index);
            attached.delete(index);
          }
        };
        refs.set(index, ref);
      }
      return ref;
    },
    flush() {
      if (!attached.size) return;
      const rows: RowMeasurement[] = [];
      for (const index of attached) {
        const element = elements.get(index);
        if (element) rows.push({ index, height: element.getBoundingClientRect().height });
      }
      attached.clear();
      engine.measureRows(rows, [...elements.keys()]);
    },
    measure() {
      for (const [index, element] of elements)
        schedule(index, element.getBoundingClientRect().height);
    },
    start() {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const index = indices.get(entry.target);
          if (index !== undefined)
            schedule(
              index,
              entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height,
            );
        }
      });
      for (const element of elements.values()) observer.observe(element, { box: 'border-box' });
    },
    stop() {
      observer?.disconnect();
      observer = undefined;
      cancelAnimationFrame(frame);
      frame = 0;
      pending.clear();
    },
  };
}
