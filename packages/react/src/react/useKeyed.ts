import { useState } from 'react';

const sameKey = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/**
 * One instance per key. Unlike `useMemo`, which React may discard and recompute, state is kept,
 * so stateful objects such as the engine or data session live exactly until their key changes.
 */
export function useKeyed<T>(create: () => T, key: readonly unknown[]): T {
  const [slot, setSlot] = useState(() => ({ key, value: create() }));
  if (sameKey(slot.key, key)) return slot.value;
  // Derived state: React re-renders immediately with the new instance.
  const next = { key, value: create() };
  setSlot(next);
  return next.value;
}
