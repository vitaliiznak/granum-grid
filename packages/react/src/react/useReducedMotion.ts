import { useEffect, useState } from 'react';

/** Resolve an explicit motion preference, or follow the system setting. */
export function useReducedMotion(preference: 'system' | boolean): boolean {
  const [system, setSystem] = useState(false);
  const followSystem = preference === 'system';
  useEffect(() => {
    if (!followSystem) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSystem(media.matches);
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [followSystem]);
  return followSystem ? system : preference;
}
