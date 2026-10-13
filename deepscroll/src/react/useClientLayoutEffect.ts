import { useEffect, useLayoutEffect } from 'react';

// Preserve pre-paint DOM work in browsers without React 18 warnings during SSR.
export const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
