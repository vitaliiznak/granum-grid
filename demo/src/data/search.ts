import type { ProviderQuery } from 'granum-grid';

type Predicate = Extract<ProviderQuery, { kind: 'predicate' }>;
type Operator = Predicate['operator'];

export const NUMBER_OPERATORS: readonly Operator[] = ['=', '!=', '>', '>=', '<', '<='];
export const TEXT_OPERATORS: readonly Operator[] = ['=', '!='];

/** Reject a predicate whose value or operator does not suit the field type. */
export function checkPredicate(query: Predicate, type: 'number' | 'text') {
  if (type === 'number' && typeof query.value !== 'number')
    throw new Error(`${query.field} requires a number.`);
  if (
    type === 'text' &&
    (typeof query.value !== 'string' || !TEXT_OPERATORS.includes(query.operator))
  )
    throw new Error(`Use ${query.field} = "…" or ${query.field} != "…".`);
}

/** Let other work run during a long scan, then stop if the search was canceled. */
export async function yieldToEventLoop(signal: AbortSignal) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

/** Missing numeric observations never satisfy a predicate, including !=. */
export function compare(value: number | string, operator: Operator, target: number | string) {
  if (typeof value !== typeof target) return false;
  if (typeof value === 'number' && (!Number.isFinite(value) || !Number.isFinite(target)))
    return false;
  return operator === '>'
    ? value > target
    : operator === '>='
      ? value >= target
      : operator === '<'
        ? value < target
        : operator === '<='
          ? value <= target
          : operator === '='
            ? String(value).toLowerCase() === String(target).toLowerCase()
            : String(value).toLowerCase() !== String(target).toLowerCase();
}
