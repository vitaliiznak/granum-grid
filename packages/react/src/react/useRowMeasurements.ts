import { useEffect } from 'react';
import type { GranumGridEngine } from '@granum/core/internal';
import { createRowMeasurements } from '@granum/core/dom';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';
import { useKeyed } from './useKeyed.js';

/** `createRowMeasurements` for one engine, observing while mounted. */
export function useRowMeasurements(engine: GranumGridEngine) {
  const measurement = useKeyed(() => createRowMeasurements(engine), [engine]);
  useEffect(() => {
    measurement.start();
    return () => measurement.stop();
  }, [measurement]);
  // Row refs attach before their owner's layout effects, so this sees the whole commit.
  useClientLayoutEffect(() => measurement.flush());
  return measurement;
}
