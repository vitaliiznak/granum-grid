# deepscroll media studio

Create README images and a short marketing film from the actual library. The studio imports `DeepScroll`, the demo's providers, and its row renderers. Every table, map, search result, and comparison is live. Only the surrounding presentation is specific to media.

![The deepscroll media presentation](images/hero.png)

## Make media

Run these commands from the repository root. Use the same Node environment as the demo (Node 22.12+ recommended for this workspace).

```sh
npm install
npx playwright install chromium
npm run media:dev
```

Open [the local studio](http://127.0.0.1:5190). Choose a scene, interact with its table, or use **Try this scene**. **Reset scene** restores its starting point. For search and comparison, the button opens the library's controls so you can try the workflow yourself. The export script performs the complete sequence automatically.

```sh
npm run media:screenshots   # All README PNGs; no FFmpeg needed
npm run media:video         # Silent 1080p MP4 and subtitle file
npm run media:all           # Both
npm run media:build         # Type-check and build the standalone studio
```

Video also requires [FFmpeg](https://ffmpeg.org/download.html) on `PATH`. Alternatively set `FFMPEG_PATH` to an existing executable. The script checks this before opening a browser. No model, API key, external dataset, font download, or paid service is needed.

To regenerate just one scene:

```sh
npm run media:screenshots -- --scene=genome
npm run media:video -- --scene=jump
```

Available scene IDs are in [src/scenes.ts](src/scenes.ts). Exports start their own Vite server on an available loopback port, launch one headless Chromium browser, and close the browser and server in `finally`. You do not need to start `media:dev` first.

## Where everything goes

| Path | Purpose |
| --- | --- |
| `src/scenes.ts` | Copy, scene order, dataset, starting position, target, and minimum duration |
| `src/main.tsx` | Preview controls and the real library component |
| `src/studio.css` | 16:9 frame, typography, and presentation colors |
| `scripts/capture.mjs` | Interaction choreography, readiness checks, screenshots, and video encoding |
| `images/*.png` | Versioned 1920 × 1080 images used by the root README |
| `output/deepscroll-launch.mp4` | Generated film; intentionally ignored by Git |
| `output/deepscroll-launch.srt` | Scene-title captions with generated timing |
| `output/manifest-*.json` | Capture date, dimensions, scene IDs, and actual durations |
| `output/deepscroll-<scene>.mp4` | A single-scene export |
| `dist/` | Optional production build; ignored by Git |

The movie is H.264, 30 fps, 1920 × 1080, with short fades between scenes and fast-start metadata. It has no audio track. Add licensed music or record the suggested narration in [STORYBOARD.md](STORYBOARD.md) in your video editor. Captions contain scene headings, not a transcript of that optional narration.

Readiness checks wait for loaded rows, completed row requests, settled navigation, and search/comparison results. Explicit pauses give viewers time to read; they are not performance measurements. Scene durations are minimums: slower machines can lengthen a scene while it finishes its interaction. Chromium frames retain their timestamps so a static hold does not become fast motion. All exports use a fresh browser context per scene, an English locale, and UTC. Timing and font rasterization can still vary between machines.

Images are only replaced after every requested scene succeeds. Existing exports remain usable if a later capture fails. Failure scratch folders stay under `output/.capture-*` for inspection; successful captures remove their intermediate frames. Browser console errors fail the capture.

## Change the story

1. Edit titles, descriptions, order, and timing in `src/scenes.ts`.
2. Edit the matching action in `scripts/capture.mjs` if the interaction should change.
3. Preview with `npm run media:dev`. `?scene=genome` opens a scene; `?capture=1&scene=genome` hides the director panel.
4. Run `npm run media:build` and export. Inspect every changed image and the video before sharing.
5. Keep README links in sync if you add or rename scenes. PNGs can be committed; attach the MP4 to a release or upload it to your chosen video host separately.

The studio deliberately stays outside `deepscroll/`. It adds no runtime dependency, media assets, or capture interface to the published library surface. Playwright and Vite come from the workspace's development dependencies. `playwright` is available through the existing `@playwright/test` dependency.

## Claims and source material

- All five datasets are generated demos. The genome uses reference chromosome lengths and approximate gene landmarks, but its sequence is synthetic. The star catalog includes named-star landmarks; it is not a downloaded Gaia catalog. Market prices and logs are illustrative.
- Row counts are navigable addresses in an on-demand provider. They are not rows downloaded into browser memory, nor a benchmark of a remote database.
- Overview and range summaries are sampled and labeled accordingly. Demo predicate search is partial. Keep those labels visible in crops and edits.
- The studio sets the demo's simulated request latency to 80 ms. These recordings make no cross-device frame-rate or latency guarantee.
- The package is an initial local release. Do not add npm availability, production adoption, accessibility certification, or performance claims without new evidence.

See the [library README](../README.md), [integration guide](../docs/GUIDE.md), and [styling guide](../STYLING.md).
