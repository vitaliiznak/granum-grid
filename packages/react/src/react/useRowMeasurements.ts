import { useEffect } from 'react';
import type { GranumGridEngine } from '@granum/core/internal';
import type { RowMeasurement } from '@granum/core/internal';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import { useKeyed } from './useKeyed.js';

/** One observer and one batched layout update, regardless of how many rows are mounted. */
export function useRowMeasurements(engine: GranumGridEngine) {
  const measurement = useKeyed(() => {
    const elements = new Map<number, HTMLDivElement>();
    const indices = new WeakMap<Element, number>();
    const refs = new Map<number, (element: HTMLDivElement | null) => void>();
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
      ref(index: number) {
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
      /** Measure newly attached rows before paint so they never show at estimated positions. */
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
  }, [engine]);
  useEffect(() => {
    measurement.start();
    return () => measurement.stop();
  }, [measurement]);
  // Row refs attach before their owner's layout effects, so this sees the whole commit.
  useClientLayoutEffect(() => measurement.flush());
  return measurement;
}
