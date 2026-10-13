import type { RefObject } from 'react';
import { useClientLayoutEffect } from './useClientLayoutEffect.js';

/**
 * Show `dialog` modally while `open`, before paint. Closing restores focus to the element
 * that was focused when it opened.
 */
export function useModalDialog(dialog: RefObject<HTMLDialogElement | null>, open: boolean) {
  useClientLayoutEffect(() => {
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
