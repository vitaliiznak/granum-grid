import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

/** State for one owner, such as a dataset: a new owner starts again from `initial`. */
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

/**
 * Show `dialog` modally while `open`, before paint. Closing restores focus to the element
 * that was focused when it opened.
 */
export function useModalDialog(dialog: RefObject<HTMLDialogElement | null>, open: boolean) {
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, [dialog, open]);
}
