# 2. Add a sensor map and summaries

[All lessons](Home.md) · [Previous: Inventory](Inventory.md) · [Next: Logs](Logs.md)

**Build:** a day of minute readings with an overview, a named warm interval, and
exact selected-range statistics.
**Run:** `/tutorials.html?lesson=sensors` on your local demo server.

## 1. Define an answer you can verify

We generate one day: 1,440 readings at 20 °C, except minutes 720–739 at 40 °C.
The warm interval contains exactly 20 readings. Its range is `[720, 740)` and its
mean, minimum, and maximum are all 40 °C. This is invented teaching data.

| Indices | Visible rows | Temperature |
| --- | --- | --- |
| 0–719 | 1–720 | 20 °C |
| 720–739 | 721–740 | 40 °C |
| 740–1439 | 741–1440 | 20 °C |

## 2. Extend the provider

Create `src/sensors.ts`. The array adapter still supplies rows; optional methods add
meaning to the overview and selection. Each bucket covers `[start, end)` and reports
its accuracy. The partition below covers a range without gaps or overlapping rows.

<!-- source: demo/src/tutorials/sensors.ts -->
```ts
import {
  createArrayProvider,
  type AggregateRequest,
  type Bucket,
  type DataProvider,
} from 'granum-grid';

export type Reading = { minute: number; celsius: number };

// One generated day: 20 °C, with a known warm interval at minutes 720–739.
const readings: Reading[] = Array.from({ length: 1440 }, (_, minute) => ({
  minute,
  celsius: minute >= 720 && minute < 740 ? 40 : 20,
}));

async function summarize(
  { start, end, buckets }: AggregateRequest,
  signal: AbortSignal,
): Promise<Bucket[]> {
  signal.throwIfAborted();
  if (
    ![start, end, buckets].every(Number.isSafeInteger) ||
    start < 0 ||
    end > readings.length ||
    end <= start ||
    buckets < 1 ||
    buckets > 512
  )
    throw new RangeError('Expected a valid range and 1–512 buckets');
  const count = Math.min(buckets, end - start);
  return Array.from({ length: count }, (_, index) => {
    const from = start + Math.floor(((end - start) * index) / count);
    const to = start + Math.floor(((end - start) * (index + 1)) / count);
    let sum = 0,
      min = Infinity,
      max = -Infinity;
    // This lesson scans at most 1,440 readings, never a large remote dataset.
    for (let i = from; i < to; i++) {
      const value = readings[i].celsius;
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return {
      start: from,
      end: to,
      count: to - from,
      avg: sum / (to - from),
      min,
      max,
      accuracy: 'exact',
    };
  });
}

export const sensors: DataProvider<Reading> = {
  ...createArrayProvider(readings, { id: 'tutorial-sensors', revision: '1' }),
  metric: { label: 'Temperature', unit: '°C', kind: 'value', domain: [0, 50] },
  fetchOverview: (buckets, signal) =>
    summarize({ start: 0, end: readings.length, buckets }, signal),
  fetchAggregates: summarize,
  async fetchMarkers(signal) {
    signal.throwIfAborted();
    return [{ id: 'warm', index: 720, label: 'Warm interval', kind: 'event' }];
  },
};
```

`metric` explains the values and unit. `fetchOverview` supplies the whole-dataset map;
`fetchAggregates` supplies requested ranges. `fetchMarkers` names index 720 so a
reader can return to the event.

These summaries are **exact** because every reading in each bucket is included.
The lesson scans at most 1,440 records per request. For large remote data, perform
aggregation on the server or use precomputed summaries. Label sampling as
`estimated`; represent missing values with `null` and the appropriate accuracy.

## 3. Connect the actions

Replace `src/App.tsx` with this component:

<!-- source: demo/src/tutorials/SensorsLesson.tsx -->
```tsx
import { useRef } from 'react';
import { GranumGrid, type GranumGridApi } from 'granum-grid';
import { sensors, type Reading } from './sensors';
import 'granum-grid/styles.css';

export default function Sensors() {
  const api = useRef<GranumGridApi<Reading>>(null);
  return (
    <section aria-label="Sensor lesson">
      <p>1,440 generated minute readings. Inspect the 20-minute warm interval.</p>
      <button
        onClick={() => {
          api.current?.setSelection({ start: 720, end: 740 });
          api.current?.scrollToIndex(720, { align: 'start' });
        }}
      >
        Inspect warm interval
      </button>
      <GranumGrid
        provider={sensors}
        apiRef={api}
        ariaLabel="Sensor readings"
        style={{ height: 680, marginTop: 16 }}
        hints={false}
        renderRow={({ row }) => (
          <span role="gridcell">
            Minute {row.minute} · {row.celsius} °C
          </span>
        )}
      />
    </section>
  );
}
```

The dataset map covers the whole day. `setSelection` records the
half-open range for summaries and comparison; `scrollToIndex` inspects its beginning.
The provider owns the data operations, so these same controls also work with a
remote provider.

## 4. Check the result

1. Read the rows beside the whole-day map. The map shows a temperature change
   near the middle.
2. Choose **Inspect warm interval**. The selected rows are **721–740**, with
   **20 rows selected**.
3. Expand **Show summary**. It says **Exact summary**, with mean, minimum, and
   maximum of **40 °C**.
4. Choose **Compare ranges**, select a second interval outside the warm section,
   then **Show comparison**. Its temperature should be 20 °C.

## 5. Change the experiment

**Exercise:** change the selected range to `{ start: 719, end: 721 }`. It contains
one 20 °C reading and one 40 °C reading, so the exact mean should be 30 °C.

When replacing generated readings with sensor measurements, decide how to represent
missing minutes and invalid readings. Row addresses refer to the ordered records;
they only equal elapsed minutes in this particular fixture.

**Next: [Search application logs](Logs.md).**
