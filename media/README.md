# deepscroll media studio

Create README screenshots and a product walkthrough by mounting the actual `demo/src/App.tsx`. The capture page uses the demo's existing CSS and controls. Screenshots crop the table or dialog directly; the video follows real clicks, typing, scrolling, and navigation.

![The deepscroll demo](images/hero.png)

## Make media

Run these commands from the repository root. Use the same Node environment as the demo (Node 22.12+ recommended for this workspace).

```sh
npm install
npx playwright install chromium
npm run media:dev
```

Open [the local studio](http://127.0.0.1:5190). Choose a scene to load the actual demo in the preview. Use its controls to try the action described in the sidebar. **Reset demo** restores the scene's starting position. The export script performs the complete sequence, including switching themes or enabling dynamic heights where needed.

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
| `src/main.tsx` | Director sidebar, demo iframe, saved-view initialization, and recording cursor |
| `src/studio.css` | Director sidebar and cursor only; no styles for the captured demo |
| `scripts/capture.mjs` | Interaction choreography, readiness checks, screenshots, and video encoding |
| `images/*.png` | Versioned PNGs cropped to the app, table, or comparison dialog |
| `output/deepscroll-launch.mp4` | Generated film; intentionally ignored by Git |
| `output/deepscroll-launch.srt` | Scene-title captions with generated timing |
| `output/manifest-*.json` | Capture date, dimensions, scene IDs, and actual durations |
| `output/deepscroll-<scene>.mp4` | A single-scene export |
| `dist/` | Optional production build; ignored by Git |

The movie is H.264, 30 fps, 1920 × 1080, with direct cuts between scenes and fast-start metadata. It has no audio track. Add licensed music or record the suggested narration in [STORYBOARD.md](STORYBOARD.md) in your video editor. Captions describe the action in each scene. They are a separate SRT track; no promotional headline is drawn over the table. A small recording cursor follows actual pointer events because Chromium screencasts omit the operating-system cursor.

Readiness checks wait for loaded rows, overview metadata, settled navigation, and the expected search/comparison results. Explicit pauses give viewers time to read; they are not performance measurements. Scene durations are minimums: slower machines can lengthen a scene while it finishes its interaction. Chromium frames retain their timestamps so a static hold does not become fast motion. All exports use a fresh browser context per scene, an English locale, and UTC. Video crops are measured from the table and scaled proportionally into 1080p; comparison uses the complete viewport to keep its dialog visible. Stills retain their natural crop dimensions. Timing and font rasterization can still vary between machines.

Images are only replaced after every requested scene succeeds. Existing exports remain usable if a later capture fails. Failure scratch folders stay under `output/.capture-*` for inspection; successful captures remove their intermediate frames. Browser console errors fail the capture.

## Change the story

1. Edit titles, descriptions, order, and timing in `src/scenes.ts`.
2. Edit the matching action in `scripts/capture.mjs` if the interaction should change.
3. Preview with `npm run media:dev`. `?scene=genome` opens a scene; `?capture=1&scene=genome` opens the actual demo with that starting view.
4. Run `npm run media:build` and export. Inspect every changed image and the video before sharing.
5. Keep README links in sync if you add or rename scenes. PNGs can be committed; attach the MP4 to a release or upload it to your chosen video host separately.

The studio deliberately stays outside `deepscroll/`. It adds no runtime dependency, media assets, or capture interface to the published library surface. Playwright and Vite come from the workspace's development dependencies. `playwright` is available through the existing `@playwright/test` dependency.

## Claims and source material

- All five datasets are generated demos. The genome uses reference chromosome lengths and approximate gene landmarks, but its sequence is synthetic. The star catalog includes named-star landmarks; it is not a downloaded Gaia catalog. Market prices and logs are illustrative.
- Row counts are navigable addresses in an on-demand provider. They are not rows downloaded into browser memory, nor a benchmark of a remote database.
- Overview and range summaries are sampled and labeled accordingly. Demo predicate search is partial. Keep those labels visible in crops and edits. The README and captions identify the synthetic source data; the screenshots contain only existing product UI.
- New captures use the demo's default simulated request latency of 1 second. These recordings make no cross-device frame-rate or latency guarantee.
- The package is an initial local release. Do not add npm availability, production adoption, accessibility certification, or performance claims without new evidence.

See the [library README](../README.md), [integration guide](../docs/GUIDE.md), and [styling guide](../STYLING.md).
