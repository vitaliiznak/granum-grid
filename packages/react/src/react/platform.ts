import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const shortcutModifier = () => {
  const { userAgentData } = navigator as Navigator & { userAgentData?: { platform: string } };
  return /mac|iphone|ipad|ipod/i.test(userAgentData?.platform ?? navigator.platform) ? '⌘' : 'Ctrl';
};

/** "⌘" on Apple platforms, otherwise "Ctrl". Server markup says "Ctrl" until hydration. */
export function useShortcutModifier(): string {
  return useSyncExternalStore(subscribe, shortcutModifier, () => 'Ctrl');
}
