import { useRef } from 'react';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';

/**
 * The latest value, for handlers and effects that must not re-run when it changes.
 * Host callbacks are often inline functions with a new identity on every render.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useClientLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
