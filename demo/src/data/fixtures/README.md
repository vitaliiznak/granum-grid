# Bundled performance recording

`exploration-trace.json` is an actual Chromium DevTools Protocol recording captured on
13 October 2026 while navigating an earlier version of the local deepscroll signal demo
(now Granum Grid); its `metadata.activity` lists the steps. The underlying signal rows
are synthetic; the browser trace events and timings are recorded measurements from this
one run. They are not a benchmark or a cross-device performance claim.

Event arguments and environment metadata have been removed. The retained fields are
name, category, phase, timestamp, duration, process ID and thread ID. Timestamps use
Chrome's microseconds; the demo normalizes them to milliseconds from the first supported
event. It imports complete (X) and instant (I/i) events and explicitly counts omitted
unsupported or invalid events. Nested durations overlap and must not be added as CPU time.

To recapture, start the demo with `npm run dev`, then run from any directory in the
repository (set `GRANUM_GRID_DEMO_URL` if the demo uses another address):

```sh
npm run record:trace
```

A recapture jumps to row 73,500,000, scrolls, jumps to Spike 3, and waits for the
nearby rows. The bundled dataset's revision is derived from the file contents, so saved
views from an earlier recording are rejected after recapturing.

The script launches headless Chromium and closes it in `finally`.

# Parquet test file

`readings.parquet` holds 1,000 generated rows (`id`, `label`, `value`, `when`) in ten
zstd-compressed row groups of 100, with statistics and a page index. The Parquet unit
and browser tests serve it with byte ranges. It was written with pyarrow 20:

```python
pq.write_table(table, 'readings.parquet', row_group_size=100, compression='zstd',
               write_page_index=True, data_page_size=256, write_statistics=True)
```
