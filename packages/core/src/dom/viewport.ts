import type { GranumGridEngine } from '../core/engine.js';
import type { RowMeasurements } from './measure.js';

/**
 * Report the viewport's height to the engine. With measured rows, a new width can rewrap
 * every row, so measurements are discarded and taken again.
 */
export function observeViewport(
  viewport: HTMLElement,
  engine: GranumGridEngine,
  measurements?: RowMeasurements,
): () => void {
  let width = viewport.clientWidth;
  const observer = new ResizeObserver(() => {
    engine.setViewport(viewport.clientHeight);
    if (measurements && viewport.clientWidth !== width) {
      width = viewport.clientWidth;
      engine.resetMeasurements();
      measurements.measure();
    }
  });
  observer.observe(viewport);
  return () => observer.disconnect();
}
