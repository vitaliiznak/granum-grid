import type { CSSProperties } from 'react';

/** Stable styling hooks. Row positioning remains owned by the virtualizer. */
export type DeepScrollPart =
  | 'toolbar'
  | 'header'
  | 'scale'
  | 'body'
  | 'viewport'
  | 'row'
  | 'rail'
  | 'footer'
  | 'jump'
  | 'hint';

export interface DeepScrollAppearance {
  classNames?: Partial<Record<DeepScrollPart, string>>;
  styles?: Partial<Record<DeepScrollPart, CSSProperties>>;
}

export function partProps(
  part: DeepScrollPart,
  appearance: DeepScrollAppearance,
  baseClass = `ds-${part}`,
) {
  return {
    'data-ds-part': part,
    className: [baseClass, appearance.classNames?.[part]].filter(Boolean).join(' '),
    style: appearance.styles?.[part],
  };
}
