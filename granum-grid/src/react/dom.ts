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

/**
 * Elements activated with Space whether or not they prevent the key's default, such as
 * `<summary>` and ARIA buttons, options, and tabs. Composite widgets that move with arrow
 * keys prevent the default themselves, which page-level handlers already respect.
 */
const SPACE_ACTIVATED = [
  'summary',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=switch]',
  '[role=radio]',
  '[role=menuitem]',
  '[role=menuitemcheckbox]',
  '[role=menuitemradio]',
  '[role=option]',
  '[role=tab]',
  '[role=treeitem]',
].join(',');

/** Whether page-level navigation keys belong to `target` instead of the explorer. */
export function ownsKeys(target: EventTarget | null): boolean {
  return isControl(target) || isWithin(target, SPACE_ACTIVATED);
}
