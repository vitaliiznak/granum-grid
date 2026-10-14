import { expect, it, vi } from 'vitest';
import { createGranumGridApi } from '../src/core/api';
import { createEngine } from '../src/core/engine';
import type { DataProvider, RowRange } from '../src/data/types';

it('captures independent views, restores selection and location, and rejects foreign views atomically', () => {
  const provider: DataProvider<number> = {
    id: 'archive',
    revision: 'v1',
    rowCount: 3_000_000_000,
    fetchRows: vi.fn(),
  };
  const visible: RowRange = { start: 0, end: 1 };
  const engine = createEngine({ rowCount: provider.rowCount });
  let selection: RowRange | null = null;
  const openSearch = vi.fn();
  const api = createGranumGridApi(provider, engine, {
    getVisibleRange: () => visible,
    getSelection: () => selection,
    setSelection: (value) => {
      selection = value;
    },
    openSearch,
    retry: vi.fn(),
  });
  try {
    api.scrollToIndex(2_999_999_999, { align: 'start' });
    api.setSelection({ start: 2_999_999_990, end: 3_000_000_000 });
    const saved = api.getView();
    // The last row ends at the viewport's bottom and stays the current row.
    expect(saved.location.position).toBe(api.getSnapshot().maxPosition);
    expect(api.getSnapshot().activeIndex).toBe(2_999_999_999);
    api.scrollToIndex(0, { align: 'start' });
    api.setSelection(null);
    api.restoreView(saved);
    expect(api.getView()).toEqual(saved);
    saved.selection!.start = 0;
    expect(api.getView().selection!.start).toBe(2_999_999_990);
    const before = api.getView();
    for (const invalid of [
      { ...before, revision: 'v2' },
      { ...before, dataset: 'other' },
      { ...before, selection: { start: 0, end: 3_000_000_001 } },
      { ...before, location: { ...before.location, position: NaN } },
    ]) {
      expect(() => api.restoreView(invalid)).toThrow(RangeError);
      expect(api.getView()).toEqual(before);
    }
    expect(() => api.setSelection({ start: -1, end: 5 })).toThrow(RangeError);
    api.openSearch('value > 10');
    expect(openSearch).toHaveBeenCalledWith('value > 10');
    expect(api.getView()).toEqual(before);
    expect(provider.fetchRows).not.toHaveBeenCalled();
  } finally {
    engine.destroy();
  }
});

it('saved views report the host value until a controlled selection is accepted', () => {
  const provider: DataProvider<number> = {
    id: 'controlled',
    revision: '1',
    rowCount: 10,
    fetchRows: vi.fn(),
  };
  const visible: RowRange = { start: 0, end: 1 };
  const engine = createEngine({ rowCount: 10 });
  const onChange = vi.fn();
  const api = createGranumGridApi(provider, engine, {
    getVisibleRange: () => visible,
    getSelection: () => null,
    setSelection: onChange,
    openSearch: vi.fn(),
    retry: vi.fn(),
  });
  try {
    api.setSelection({ start: 2, end: 4 });
    expect(onChange).toHaveBeenCalledWith({ start: 2, end: 4 });
    expect(api.getView().selection).toBeNull();
  } finally {
    engine.destroy();
  }
});

it('restores a saved offset inside a measured final row taller than the viewport', () => {
  const provider: DataProvider<number> = {
    id: 'tall',
    revision: '1',
    rowCount: 2,
    fetchRows: vi.fn(),
  };
  const visible: RowRange = { start: 0, end: 1 };
  const engine = createEngine({ rowCount: 2, dynamicRowHeight: true });
  const api = createGranumGridApi(provider, engine, {
    getVisibleRange: () => visible,
    getSelection: () => null,
    setSelection: () => {},
    openSearch: () => {},
    retry: () => {},
  });
  try {
    engine.setViewport(100);
    engine.measureRows([{ index: 1, height: 500 }]);
    api.scrollToIndex(1, { align: 'start' });
    engine.pan(400);
    const view = api.getView();
    expect(view.location.position).toBeCloseTo(1.8);
    api.scrollToIndex(0, { align: 'start' });
    api.restoreView(view);
    expect(api.getView()).toEqual(view);
    expect(() => api.restoreView({ ...view, location: { ...view.location, position: 2 } })).toThrow(
      RangeError,
    );
  } finally {
    engine.destroy();
  }
});

it('is the one handle: navigation, detached selection, search, and retry without the engine adapters', () => {
  const provider: DataProvider<number> = {
    id: 'handle',
    revision: '1',
    rowCount: 1_000,
    fetchRows: vi.fn(),
  };
  const visible: RowRange = { start: 0, end: 1 };
  const engine = createEngine({ rowCount: provider.rowCount });
  let selection: RowRange | null = { start: 10, end: 20 };
  const retry = vi.fn();
  const api = createGranumGridApi(provider, engine, {
    getVisibleRange: () => visible,
    getSelection: () => selection,
    setSelection: (value) => {
      selection = value;
    },
    openSearch: vi.fn(),
    retry,
  });
  try {
    engine.setViewport(320);
    const seen: number[] = [];
    const off = api.onNavigate((event) => seen.push(event.to.position));
    api.goTo(500);
    expect(api.getSnapshot().position).toBe(500);
    api.back();
    expect(api.getSnapshot().position).toBe(0);
    api.forward();
    expect(api.getSnapshot().position).toBe(500);
    off();
    expect(seen).toEqual([500, 0, 500]);
    const copy = api.getSelection()!;
    copy.start = 0;
    expect(api.getSelection()).toEqual({ start: 10, end: 20 });
    api.retry();
    expect(retry).toHaveBeenCalledOnce();
    // Adapters and unvalidated locations stay on the engine.
    for (const adapter of ['pan', 'scrub', 'measureRows', 'appendRows', 'restore', 'getLocation'])
      expect(adapter in api).toBe(false);
    // The visible range is a detached copy, like the selection.
    const range = api.getVisibleRange();
    range.end = 99;
    expect(api.getVisibleRange()).toEqual({ start: 0, end: 1 });
  } finally {
    engine.destroy();
  }
});
