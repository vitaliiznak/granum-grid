/** Event targets that keep their own keys, wheel, and pointer input. */
function elementOf(target: EventTarget | null): HTMLElement | null {
  return target && 'closest' in target ? (target as HTMLElement) : null;
}

/** Text entry, including every editable contenteditable state (`""`, `true`, `plaintext-only`). */
export function isTextEntry(target: EventTarget | null): boolean {
  const element = elementOf(target);
  return !!element && (!!element.closest('input,textarea,select') || element.isContentEditable);
}

/** Text entry plus buttons and links, whose activation keys and clicks belong to them. */
export function isControl(target: EventTarget | null): boolean {
  const element = elementOf(target);
  return !!element && (isTextEntry(element) || !!element.closest('button,a'));
}

/** Whether `target` is inside one of `selector`, such as dialogs that own their scrolling. */
export function isWithin(target: EventTarget | null, selector: string): boolean {
  return !!elementOf(target)?.closest(selector);
}
