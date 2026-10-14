import type { GranumGridEngine } from '../core/engine.js';
import type { CoordinateMapping } from '../core/mappings.js';
import type { DataSession } from '../data/session.js';
import type { Features } from '../features.js';

/**
 * Key for the state the library's own widgets read from `useGranumGrid`. It is not exported
 * from any package entry, so the session, mapping, and raw engine stay out of the public API.
 */
export const INTERNAL: unique symbol = Symbol('granum-grid');

export interface GridInternals<Row> {
  /** Prefix for element ids within this explorer. */
  id: string;
  /** The engine with its input, measurement, and animation adapters. */
  engine: GranumGridEngine;
  /** Row pages, metadata, and requests for the current provider revision. */
  session: DataSession<Row>;
  mapping: CoordinateMapping;
  features: Features;
  reduceMotion: boolean;
  append: boolean;
}
