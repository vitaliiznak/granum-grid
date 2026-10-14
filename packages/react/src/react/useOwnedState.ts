import { useCallback, useState } from 'react';

/** State for one owner, such as an engine: a new owner starts again from `initial`. */
export function useOwnedState<T>(owner: unknown, initial: T) {
  const [state, setState] = useState({ owner, value: initial });
  const value = state.owner === owner ? state.value : initial;
  const set = useCallback(
    (next: T | ((current: T) => T)) =>
      setState((current) => {
        const previous = current.owner === owner ? current.value : initial;
        return {
          owner,
          value: typeof next === 'function' ? (next as (current: T) => T)(previous) : next,
        };
      }),
    [owner, initial],
  );
  return [value, set] as const;
}
