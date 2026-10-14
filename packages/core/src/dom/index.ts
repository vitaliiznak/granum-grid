// Framework-free DOM bindings: native scrolling for an element or the window, the explorer's
// keys, and the event-target rules that keep host controls their own keys and clicks.
export { bindScroll, scrollMapping, MAX_SCROLL } from './scroll.js';
export type { ScrollMapping, ScrollOptions } from './scroll.js';
export { handleMovementKey, handleViewportKey, isSearchShortcut } from './keyboard.js';
export { NATIVE_SCROLL, isControl, isTextEntry, isWithin, ownsKeys } from './targets.js';
