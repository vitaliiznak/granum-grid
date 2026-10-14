import type { CSSProperties } from 'react';

/** Stable styling hooks. Row positioning remains owned by the virtualizer. */
export type GranumGridPart =
  'toolbar' | 'header' | 'body' | 'viewport' | 'row' | 'rail' | 'footer' | 'jump' | 'hint';

export interface GranumGridAppearance {
  classNames?: Partial<Record<GranumGridPart, string>>;
  styles?: Partial<Record<GranumGridPart, CSSProperties>>;
}

export function partProps(
  part: GranumGridPart,
  appearance: GranumGridAppearance,
  baseClass = `ds-${part}`,
) {
  return {
    'data-ds-part': part,
    className: [baseClass, appearance.classNames?.[part]].filter(Boolean).join(' '),
    style: appearance.styles?.[part],
  };
}
