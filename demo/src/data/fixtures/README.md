# Bundled performance recording

`exploration-trace.json` is an actual Chromium DevTools Protocol recording captured on
13 October 2026 while navigating the local deepscroll signal demo: jump, wheel scroll,
fit the overview, then inspect a summary range. The underlying signal rows are synthetic;
the browser trace events and timings are recorded measurements from this one run.
They are not a benchmark or a cross-device performance claim.

Event arguments and environment metadata have been removed. The retained fields are
name, category, phase, timestamp, duration, process ID and thread ID. Timestamps use
Chrome's microseconds; the demo normalizes them to milliseconds from the first supported
event. It imports complete (X) and instant (I/i) events and explicitly counts omitted
unsupported or invalid events. Nested durations overlap and must not be added as CPU time.

To recapture against a running local demo:

```sh
DEEPSCROLL_DEMO_URL=http://127.0.0.1:5193 node scripts/record-demo-trace.mjs
```

The script launches headless Chromium and closes it in `finally`.
