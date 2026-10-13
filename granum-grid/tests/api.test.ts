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
  const engine = createEngine({ rowCount: provider.rowCount });
  let selection: RowRange | null = null;
  const openSearch = vi.fn();
  const api = createGranumGridApi(provider, engine, {
    getSelection: () => selection,
    setSelection: (value) => {
      selection = value;
    },
    openSearch,
  });
  try {
    api.scrollToIndex(2_999_999_999, { align: 'start' });
    api.setSelection({ start: 2_999_999_990, end: 3_000_000_000 });
    const saved = api.getView();
    expect(saved.location.position).toBe(2_999_999_999);
    api.zoomToRange({ start: 0, end: 100 });
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
  const engine = createEngine({ rowCount: 10 });
  const onChange = vi.fn();
  const api = createGranumGridApi(provider, engine, {
    getSelection: () => null,
    setSelection: onChange,
    openSearch: vi.fn(),
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
  const engine = createEngine({ rowCount: 2, dynamicRowHeight: true });
  const api = createGranumGridApi(provider, engine, {
    getSelection: () => null,
    setSelection: () => {},
    openSearch: () => {},
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
