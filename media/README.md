# Granum Grid media studio

Create README screenshots and a marketing film by mounting the actual `demo/src/App.tsx`. The capture page uses the demo's existing CSS and controls. Screenshots crop the table or dialog directly. The film surrounds real clicks, typing, scrolling, and navigation with benefit-led headlines, a charcoal, ivory, and cobalt visual treatment, and opening and closing title cards.

![The Granum Grid demo](images/hero.png)

## Make media

Run these commands from the repository root with Node 22 (`.nvmrc`), as for the demo.

```sh
npm ci
npx playwright install chromium
npm run media:dev
```

Open [the local studio](http://127.0.0.1:5190). Choose a scene to load the actual demo in the preview. Use its controls to try the action described in the sidebar. **Reset demo** restores the scene's starting position. Sidebar links preview the 1920 × 1080 scene artwork (using the last saved screenshot), opening, integration, and closing cards, or play the latest exported film. The export script performs the complete sequence, including switching themes or enabling dynamic heights where needed.

```sh
npm run media:screenshots   # One PNG per scene; no FFmpeg needed
node media/scripts/soundtrack.mjs fetch  # One-time music download with checksum verification
npm run media:video         # 1080p MP4 with licensed music and subtitles
npm run media:all           # Both
npm run media:build         # Type-check and build the standalone studio
```

The root README's `images/performance.png` is not produced by a scene, so these commands do not refresh it.

Video also requires [FFmpeg](https://ffmpeg.org/download.html) on `PATH`. Alternatively set `FFMPEG_PATH` to an existing executable. The script checks this and the cached music checksum before opening a browser. The explicit music download requires network access once; captures then run offline. No model, API key, external dataset, font download, or paid service is needed.

To regenerate just one scene:

```sh
npm run media:screenshots -- --scene=genome
npm run media:video -- --scene=jump
```

Available scene IDs are in [src/scenes.ts](src/scenes.ts). Exports freeze a production build in a scratch directory, then start their own Vite preview server on an available loopback port, launch one headless Chromium browser, and close the browser and server in `finally`. You do not need to start `media:dev` first.

## Where everything goes

| Path                                       | Purpose                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/scenes.ts`                            | Headlines, supporting copy, scene order, dataset, starting position, target, search query, and minimum duration |
| `src/Marketing.tsx`, `src/marketing.css`   | Film artwork, title cards, brand treatment, and shared footage-window dimensions                                |
| `src/main.tsx`                             | Director sidebar, demo iframe, saved-view initialization, and recording cursor                                  |
| `src/studio.css`                           | Director sidebar and cursor only; no styles for the captured demo                                               |
| `scripts/capture.mjs`                      | Interaction choreography, readiness checks, screenshots, and video encoding                                     |
| `scripts/soundtrack.mjs`                   | Licensed-track metadata, verified download, trimming, and fades                                                 |
| `images/*.png`                             | Versioned PNGs cropped to the app, table, or comparison dialog                                                  |
| `granum-grid-launch.mp4`                    | The film linked from the playground README                                                                      |
| `output/granum-grid-launch.mp4`             | The same film as generated; `output/` stays ignored, so copy a keeper into `media/`                             |
| `output/granum-grid-launch.srt`             | Scene-title captions with generated timing                                                                      |
| `output/granum-grid-launch-description.txt` | Publishing description with required music attribution                                                          |
| `output/manifest-*.json`                   | Capture date, dimensions, scene IDs, and actual durations                                                       |
| `output/granum-grid-<scene>.mp4`            | A single-scene export                                                                                           |
| `dist/`                                    | Optional production build; ignored by Git                                                                       |

## The film

The full cut opens with **Turn data into clarity** (7 s), plays twelve scenes in the order of `src/scenes.ts` (hero, jump, history, overview, genome, logs, market, stars, dynamic, selection, compare, saved), shows a card of six integration capabilities (10 s), and closes with **Make your data make sense** (8 s). The planned minimum is 136 seconds; the manifest and SRT record actual timings. Each scene names its user benefit and three supporting capabilities; its headline, copy, and minimum seconds live in `src/scenes.ts`, and the cards in `src/Marketing.tsx`.

- Format: H.264, 30 fps, 1920 × 1080, with quick fades, independent headline/diagram reveals on the title cards, and fast-start metadata.
- Music: **Firefly** by Scott Buckley (piano, synths, and light drums) fades in and out and is mixed in two passes to a -17 LUFS target with a -2 dBTP ceiling, encoded as 192 kb/s stereo AAC. See [MUSIC.md](MUSIC.md) for the CC BY 4.0 source and the credit to keep in published descriptions, especially on YouTube. The cached source and intermediate audio stay Git-ignored.
- No narration. Headlines and supporting copy are burned in above a dedicated window for the live product recording, with source labels below it. A separate SRT track has each headline and a description of the action. A small recording cursor follows actual pointer events because Chromium screencasts omit the operating-system cursor.
- Single-scene exports keep the headline layout and their own music fades, without the title cards.

## Capture behavior

- Readiness checks wait for loaded rows, overview metadata, settled navigation, and the expected search/comparison results. Explicit pauses give viewers time to read; they are not performance measurements. Each interaction holds its final result for at least three seconds.
- Scene durations are minimums: slower machines can lengthen a scene while it finishes its interaction. Chromium frames keep their timestamps so a static hold does not become fast motion.
- Every export uses a fresh browser context per scene, an English locale, and UTC. The frozen build prevents hot reload from interrupting a take.
- Video records the full-page explorer at 1440 × 640 and scales it into the film window; stills use the same layout at double pixel density and crop to the explorer or the relevant dialog. The saved-view still keeps the named view visible. The dark-theme scene uses a 1440 × 946 embedded view, to keep the theme control, and crops to the explorer.
- Images are only replaced after every requested scene succeeds, so existing exports remain usable if a later capture fails. Failure scratch folders stay under `output/.capture-*`; successful captures remove their intermediate frames. Browser console errors fail the capture. Timing and font rasterization can still vary between machines.

## Change the story

1. Edit headlines, supporting promises, titles, descriptions, order, and timing in `src/scenes.ts`. Edit the opening, closing, and visual treatment in `src/Marketing.tsx` and `src/marketing.css`.
2. Edit the matching action in `scripts/capture.mjs` if the interaction should change.
3. Preview with `npm run media:dev`. `?scene=genome` opens a scene; `?capture=1&scene=genome` opens the actual demo with that starting view. `?artwork=scene&scene=genome` previews its film layout; `?artwork=intro`, `?artwork=capabilities`, and `?artwork=outro` show the title cards.
4. Run `npm run media:build` and export. Inspect every changed image and the video before sharing.
5. Keep README links in sync if you add or rename scenes. PNGs can be committed. Copy a keeper of the launch film to `granum-grid-launch.mp4` so the README can play it; the `output/` export stays ignored.

The studio deliberately stays outside `granum-grid/`. It adds no runtime dependency, media assets, or capture interface to the published library surface. Playwright and Vite come from the workspace's development dependencies. `playwright` is available through the existing `@playwright/test` dependency.

## Claims and source material

- All five datasets are generated demos. The genome uses reference chromosome lengths and approximate gene landmarks, but its sequence is synthetic. The star catalog includes named-star landmarks; it is not a downloaded Gaia catalog. Market prices and logs are illustrative.
- Row counts are navigable addresses in an on-demand provider. They are not rows downloaded into browser memory, nor a benchmark of a remote database.
- Overview and range summaries are sampled and labeled accordingly. Demo predicate search is partial. Keep those labels visible in crops and edits. The README and captions identify the synthetic source data; the screenshots contain only existing product UI. The address illustration on the opening card is not a measured chart.
- New captures use the demo's default simulated request latency of 1 second. These recordings make no cross-device frame-rate or latency guarantee.
- The package is an initial local release. Do not add npm availability, purchase, production adoption, accessibility certification, or performance claims without new evidence.

See the [playground README](../README.md), [marketing notes](MARKETING.md), [integration guide](../docs/GUIDE.md), and [styling guide](../STYLING.md).
