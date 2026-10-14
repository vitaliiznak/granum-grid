import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { renderSoundtrack, soundtrack, soundtrackSource } from './soundtrack.mjs';

const usage = 'Usage: node media/scripts/capture.mjs screenshots|video|all [--scene=hero]';
let args;
try {
  args = parseArgs({ allowPositionals: true, options: { scene: { type: 'string' } } });
} catch {
  throw new Error(usage);
}
const [mode = 'screenshots', ...extra] = args.positionals;
const filter = args.values.scene;
if (!['screenshots', 'video', 'all'].includes(mode) || extra.length) throw new Error(usage);

const root = fileURLToPath(new URL('../..', import.meta.url));
const video = mode !== 'screenshots';
const screenshots = mode !== 'video';
const output = path.join(root, 'media/output');
const images = path.join(root, 'media/images');
const size = { width: 1920, height: 1080 };
// Compose the actual full-page explorer, rather than shrinking the entire demo site.
const recordingSize = { width: 1440, height: 640 };
const embeddedSize = { width: 1440, height: 946 };
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-12000);
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve(stderr) : reject(new Error(`${command} exited ${code}: ${stderr}`)),
    );
  });
}
// FFmpeg arguments are grouped per option; this overwrites outputs and reports only errors.
const runFFmpeg = (...groups) => run(ffmpeg, ['-y', '-loglevel', 'error', ...groups.flat()]);
const loopImage = (file) => ['-loop', '1', '-framerate', '30', '-i', file];
const concatList = (file) => ['-f', 'concat', '-safe', '0', '-i', file];
// Silent H.264 clips; the soundtrack is muxed once over the finished sequence.
const h264 = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '19', '-pix_fmt', 'yuv420p', '-an'];

const pause = (page, milliseconds) => page.waitForTimeout(milliseconds);
const explorer = (page) => page.locator('.demo-explorer').first();
const rowLabel = (index) => (index + 1).toLocaleString('en-US');
function collectErrors(page, errors) {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}
// Every take gets a fresh context; an English locale and UTC keep numbers and dates stable.
const sceneContext = (options) =>
  browser.newContext({ viewport: recordingSize, locale: 'en-US', timezoneId: 'UTC', ...options });
async function settled(page) {
  await explorer(page).waitFor();
  await page.waitForFunction(() => {
    const root = document.querySelector('.demo-explorer');
    return (
      root &&
      !root.querySelector('[data-status="loading"], [data-status="error"]') &&
      !root.querySelector('.ds-meta-error') &&
      !root.querySelector('.ds-legend')?.textContent.includes('loading') &&
      !root.querySelector('.ds-aggregate-label')
    );
  });
  await page.evaluate(() => document.fonts.ready);
}
async function click(page, target) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
  await target.click();
}
async function prepare(page, url, scene, filming) {
  // The demo's theme switch lives in its normal header. Keep that one scene in
  // embedded mode; all other scenes use the existing full-page product view.
  const embedded = scene.theme === 'dark';
  await page.setViewportSize(embedded ? embeddedSize : recordingSize);
  await page.goto(
    `${url}?capture=1${embedded ? '' : '&page=1'}&scene=${scene.id}${filming ? '&film=1' : ''}`,
  );
  await settled(page);
  await explorer(page).locator('[role="row"][data-status="ready"]').first().waitFor();
  if (embedded) await page.getByRole('button', { name: 'Toggle color theme' }).click();
  if (scene.action === 'expand') {
    await page.getByRole('button', { name: 'debug', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Dynamic row heights', exact: true }).check();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await settled(page);
  }
  // Move the camera to the table, without changing the product's CSS or markup.
  if (embedded) {
    await explorer(page).evaluate((node) =>
      node.scrollIntoView({ block: 'start', behavior: 'instant' }),
    );
  }
  await pause(page, 400);
  await page.mouse.move(20, 20);
  return explorer(page).boundingBox();
}
async function perform(page, scene, filming) {
  const hold = (ms) => (filming ? pause(page, ms) : Promise.resolve());
  const table = explorer(page);
  const rowReady = (index) =>
    table.locator(`[role="row"][aria-rowindex="${index + 1}"][data-status="ready"]`).waitFor();
  const openJump = async () => {
    await click(page, table.getByRole('button', { name: /Go to…/ }));
    return page.getByRole('textbox', { name: 'Go to row, date, or event' });
  };
  const jumpResult = (index) =>
    page.locator('.ds-jump-results button').filter({ hasText: `Row ${rowLabel(index)}` });
  const select = async (first, last) => {
    await click(page, page.getByRole('button', { name: /^Enter row numbers/ }));
    await page.getByLabel('From row', { exact: true }).fill(String(first));
    await page.getByLabel('To row', { exact: true }).fill(String(last));
    await click(page, page.getByRole('button', { name: 'Use these rows', exact: true }));
  };
  const jumpTo = async (index) => {
    const input = await openJump();
    await input.pressSequentially(rowLabel(index), { delay: filming ? 60 : 0 });
    await jumpResult(index).waitFor();
    await hold(350);
    await input.press('Enter');
    await rowReady(index);
    await settled(page);
  };
  await hold(650);
  if (scene.action === 'jump') {
    if (!scene.query) throw new Error(`Jump scene ${scene.id} needs a query in scenes.ts`);
    const input = await openJump();
    await input.pressSequentially(scene.query, { delay: filming ? 75 : 0 });
    await jumpResult(scene.target).first().waitFor();
    // Named markers can arrive before the provider search finishes. Enter is
    // intentionally ignored while busy, so wait for the actual search status.
    await page.waitForFunction(() => {
      const status = document.querySelector('dialog[open] [role="status"]');
      return status && !status.textContent.includes('Searching');
    });
    await hold(1100);
    await input.press('Enter');
    await rowReady(scene.target);
  } else if (scene.action === 'history') {
    await jumpTo(scene.target);
    await hold(1100);
    await click(
      page,
      table.getByRole('button', { name: 'Back to previous location', exact: true }),
    );
    await rowReady(scene.index);
    await settled(page);
    await hold(1400);
    await click(page, table.getByRole('button', { name: 'Forward', exact: true }));
    await rowReady(scene.target);
  } else if (scene.action === 'select') {
    await click(page, table.getByRole('button', { name: 'Select rows', exact: true }));
    await select(73_500_000, 73_500_100);
    const selection = table.getByRole('region', { name: 'Your selection', exact: true });
    await click(page, selection.getByText('Show summary', { exact: true }));
    await selection.getByText('Estimated summary', { exact: true }).waitFor();
    await hold(1700);
  } else if (scene.action === 'save') {
    await click(page, table.getByRole('button', { name: /^Bookmarks/ }));
    await click(
      page,
      table.getByRole('button', { name: 'Bookmark current position', exact: true }),
    );
    await page.getByLabel('Bookmark name', { exact: true }).fill('Signal investigation');
    await hold(500);
    await click(page, table.getByRole('button', { name: 'Save bookmark', exact: true }));
    await table.getByRole('status').filter({ hasText: 'Saved “Signal investigation”' }).waitFor();
    await hold(600);
    await jumpTo(scene.target);
    await hold(700);
    await click(page, table.getByRole('button', { name: /^Bookmarks/ }));
    await hold(900);
    await click(
      page,
      table
        .getByRole('region', { name: 'Bookmarks', exact: true })
        .getByRole('button', { name: /^Signal investigation/ }),
    );
    await rowReady(scene.index);
  } else if (scene.action === 'overview') {
    await table.getByTestId('overview').waitFor();
    await click(page, table.getByRole('button', { name: scene.query, exact: true }));
    await rowReady(scene.target);
  } else if (scene.action === 'search') {
    const input = await openJump();
    await input.pressSequentially('status >= 500', { delay: filming ? 55 : 0 });
    await page
      .getByRole('button', { name: /^status 50\d/ })
      .first()
      .waitFor();
    await hold(1800);
    if (filming) {
      await input.press('Enter');
      await table
        .locator('.ds-row[data-focused] .lg-status')
        .filter({ hasText: /^50\d$/ })
        .waitFor();
    }
  } else if (scene.action === 'expand') {
    await click(
      page,
      table.getByRole('button', { name: `Expand row ${scene.index + 1}`, exact: true }),
    );
    await table.locator('.expanded-note').waitFor();
  } else if (scene.action === 'compare') {
    await click(page, table.getByRole('button', { name: 'Select rows', exact: true }));
    await select(1_000_000, 1_000_100);
    await click(page, page.getByRole('button', { name: 'Compare ranges', exact: true }));
    await click(page, page.getByRole('button', { name: 'Choose second range', exact: true }));
    await select(61_700_000, 61_700_100);
    await hold(900);
    await click(page, page.getByRole('button', { name: 'Show comparison', exact: true }));
    const dialog = page.getByRole('dialog', { name: 'Compare selected ranges' });
    await dialog
      .getByRole('grid', { name: 'First range rows' })
      .locator('[data-status="ready"]')
      .first()
      .waitFor();
    await dialog
      .getByRole('grid', { name: 'Second range rows' })
      .locator('[data-status="ready"]')
      .first()
      .waitFor();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.ds-compare [role="status"]')].filter(
          (node) => node.textContent === 'Estimated summary',
        ).length === 2,
    );
    if (filming) {
      await hold(1600);
      await dialog.getByRole('grid', { name: 'First range rows' }).hover();
      await page.mouse.wheel(0, 160);
    }
  } else if (filming) {
    await table.getByRole('grid').hover();
    for (let i = 0; i < 24; i++) {
      await page.mouse.wheel(0, 10);
      await pause(page, 45);
    }
  }
  await settled(page);
  await pause(page, 500);
}
async function still(page, scene, file) {
  const table = explorer(page);
  await page.mouse.move(20, 20);
  if (scene.action === 'compare') {
    await page.getByRole('dialog', { name: 'Compare selected ranges' }).screenshot({ path: file });
  } else if (scene.action === 'search') {
    // A search image should let readers read the query and completeness label,
    // not surround a tiny dialog with a large, blurred, inactive table.
    await page.getByRole('dialog', { name: 'Jump to a location' }).screenshot({ path: file });
  } else if (scene.action === 'save') {
    // The restored rows alone look like an ordinary table. Show the bookmark
    // alongside its destination so this still actually explains the feature.
    await click(page, table.getByRole('button', { name: /^Bookmarks/ }));
    await table
      .getByRole('region', { name: 'Bookmarks', exact: true })
      .getByRole('button', { name: /^Signal investigation/ })
      .waitFor();
    await page.mouse.move(0, 0);
    await table.screenshot({ path: file, animations: 'disabled' });
  } else {
    await table.screenshot({ path: file, animations: 'disabled' });
  }
}

// Title cards are exported as three layers so FFmpeg can reveal the headline and
// diagram independently, while the logo/footer stay still and legible.
const cardCopy = '.film-card-copy, .film-capabilities-copy';
const cardVisual = '.film-map, .film-capability-grid';
const transparentCard =
  'html, body, .media-artwork-preview, .film-canvas { background: transparent !important; } .film-canvas::before, .film-header, .film-card-footer { visibility: hidden; }';
const hidden = (selectors) => `${selectors} { visibility: hidden; }`;
const cardLayer = (id, name) => path.join(scratch, `${id}-${name}.png`);
async function screenshotWith(page, css, options) {
  const style = await page.addStyleTag({ content: css });
  await page.screenshot(options);
  await style.evaluate((node) => node.remove());
}

let server;
let browser;
let scratch;
let failed = false;
const manifest = {
  generatedAt: new Date().toISOString(),
  viewport: size,
  recordingViewport: video ? recordingSize : undefined,
  screenshotScale: screenshots ? 2 : undefined,
  synthetic: true,
  scenes: [],
  sequence: [],
};
try {
  if (video) {
    await soundtrackSource();
    try {
      await run(ffmpeg, ['-version']);
    } catch {
      throw new Error(
        'Video export needs FFmpeg on PATH (or FFMPEG_PATH). Screenshot export does not.',
      );
    }
  }
  await mkdir(output, { recursive: true });
  await mkdir(images, { recursive: true });
  scratch = await mkdtemp(path.join(output, '.capture-'));
  // Freeze a build for this take: edits in the shared checkout must not hot-reload a recording.
  const studioBuild = path.join(scratch, 'studio');
  await build({
    configFile: path.join(root, 'media/vite.config.ts'),
    build: { outDir: studioBuild },
    logLevel: 'error',
  });
  server = await preview({
    configFile: path.join(root, 'media/vite.config.ts'),
    build: { outDir: studioBuild },
    preview: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
    logLevel: 'error',
  });
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const discovery = await browser.newPage();
  let scenes;
  let titleCards;
  let filmWindow;
  try {
    await discovery.goto(`${url}?capture=1`);
    await discovery.waitForFunction(() => window.__granumGridMedia);
    ({ scenes, titleCards, filmWindow } = await discovery.evaluate(() => window.__granumGridMedia));
  } finally {
    await discovery.close();
  }
  if (filter) scenes = scenes.filter((scene) => scene.id === filter);
  if (!scenes.length) throw new Error(`Unknown scene: ${filter}`);

  async function artwork(id, card = false) {
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const errors = [];
      collectErrors(page, errors);
      await page.goto(`${url}?artwork=${card ? id : 'scene'}&scene=${id}&plate=1`);
      await page.locator('.film-canvas').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(scratch, `${id}-artwork.png`);
      await page.screenshot({ path: file });
      if (card) {
        await screenshotWith(page, hidden(`${cardCopy}, ${cardVisual}`), {
          path: cardLayer(id, 'base'),
        });
        await screenshotWith(page, `${transparentCard} ${hidden(cardVisual)}`, {
          path: cardLayer(id, 'copy'),
          omitBackground: true,
        });
        await screenshotWith(page, `${transparentCard} ${hidden(cardCopy)}`, {
          path: cardLayer(id, 'visual'),
          omitBackground: true,
        });
      }
      if (errors.length) throw new Error(`${id} artwork errors:\n${errors.join('\n')}`);
      return file;
    } finally {
      await context.close();
    }
  }
  async function titleCard(id) {
    const card = titleCards.find((item) => item.id === id);
    await artwork(id, true);
    await runFFmpeg(
      loopImage(cardLayer(id, 'base')),
      loopImage(cardLayer(id, 'copy')),
      loopImage(cardLayer(id, 'visual')),
      [
        '-filter_complex',
        `[1:v]format=rgba,fade=t=in:st=0.1:d=0.55:alpha=1[copy];[2:v]format=rgba,fade=t=in:st=0.35:d=0.65:alpha=1[visual];[0:v][copy]overlay=0:'40*pow(1-min(t/0.75,1),3)'[text];[text][visual]overlay='85*pow(1-min(t/1.05,1),3)':0,fade=t=out:st=${card.seconds - 0.3}:d=0.3,format=yuv420p[film]`,
      ],
      ['-map', '[film]', '-t', String(card.seconds)],
      h264,
      path.join(scratch, `${id}.mp4`),
    );
    manifest.sequence.push({ ...card, kind: 'title' });
  }
  if (video && !filter) {
    console.log('Rendering opening card…');
    await titleCard('intro');
  }

  for (const scene of scenes) {
    console.log(`Capturing ${scene.id}…`);
    const background = video ? await artwork(scene.id) : undefined;
    const context = await sceneContext({
      deviceScaleFactor: video ? 1 : 2,
      reducedMotion: 'no-preference',
      colorScheme: scene.theme ?? 'light',
    });
    let page;
    let encoder;
    let stream;
    let recording = false;
    let began;
    let ended;
    const errors = [];
    try {
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      collectErrors(page, errors);
      const camera = await prepare(page, url, scene, video);
      if (video) {
        // Chromium emits frames only when content changes. Timestamp each still and let
        // FFmpeg preserve the holds; do not speed up a mostly static table to 30 fps.
        stream = await context.newCDPSession(page);
        const frames = [];
        const pending = [];
        const frameDir = path.join(scratch, scene.id);
        await mkdir(frameDir);
        stream.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
          pending.push(stream.send('Page.screencastFrameAck', { sessionId }).catch(() => {}));
          if (!recording) return;
          const name = `frame-${String(frames.length).padStart(6, '0')}.jpg`;
          frames.push({ name, time: metadata.timestamp });
          pending.push(writeFile(path.join(frameDir, name), Buffer.from(data, 'base64')));
        });
        began = Date.now();
        recording = true;
        await stream.send('Page.startScreencast', {
          format: 'jpeg',
          quality: 92,
          maxWidth: size.width,
          maxHeight: size.height,
          everyNthFrame: 1,
        });
        encoder = async () => {
          recording = false;
          ended = Date.now();
          await stream.send('Page.stopScreencast');
          await Promise.all(pending);
          if (!frames.length) throw new Error(`No video frames received for ${scene.id}`);
          const length = Math.round(((ended - began) / 1000) * 30) / 30;
          const timeline = frames
            .map((frame, i) => {
              const duration =
                i < frames.length - 1
                  ? frames[i + 1].time - frame.time
                  : Math.max(1 / 30, length - (frame.time - frames[0].time));
              return `file '${frame.name}'\nduration ${Math.max(1 / 60, duration).toFixed(6)}`;
            })
            .join('\n');
          await writeFile(
            path.join(frameDir, 'frames.txt'),
            `${timeline}\nfile '${frames.at(-1).name}'\n`,
          );
          const clip = path.join(scratch, `${scene.id}.mp4`);
          const crop =
            scene.theme === 'dark'
              ? `crop=${Math.round(camera.width)}:${Math.round(camera.height)}:${Math.round(camera.x)}:${Math.round(camera.y)},`
              : '';
          const { x, y, width, height } = filmWindow;
          await runFFmpeg(
            loopImage(background),
            concatList(path.join(frameDir, 'frames.txt')),
            [
              '-filter_complex',
              `[1:v]${crop}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=${scene.theme === 'dark' ? '0x181b22' : '0xe8e9ed'},setsar=1[live];[0:v][live]overlay=${x}:${y}:shortest=1,fade=t=in:st=0:d=0.18,fps=30[film]`,
            ],
            ['-map', '[film]', '-t', length.toFixed(3)],
            h264,
            clip,
          );
          return { clip, length };
        };
      }
      await perform(page, scene, video);
      let clip;
      if (video) {
        // Reserve a readable result, regardless of how long loading/typing took.
        await pause(page, Math.max(3000, scene.seconds * 1000 - (Date.now() - began)));
        clip = await encoder();
      }
      if (screenshots) {
        // Always capture the same deterministic still, independently of the film's end state.
        if (video) {
          const stillContext = await sceneContext({ deviceScaleFactor: 2 });
          try {
            const stillPage = await stillContext.newPage();
            collectErrors(stillPage, errors);
            await prepare(stillPage, url, scene, false);
            await perform(stillPage, scene, false);
            await still(stillPage, scene, path.join(scratch, `${scene.id}.png`));
          } finally {
            await stillContext.close();
          }
        } else {
          await still(page, scene, path.join(scratch, `${scene.id}.png`));
        }
      }
      if (errors.length) throw new Error(`${scene.id} browser errors:\n${errors.join('\n')}`);
      manifest.scenes.push({
        id: scene.id,
        title: scene.title,
        headline: scene.headline,
        seconds: clip?.length,
        screenshot: screenshots ? `media/images/${scene.id}.png` : undefined,
      });
      if (video)
        manifest.sequence.push({
          id: scene.id,
          kind: 'demo',
          title: `${scene.headline}\n${scene.title}`,
          seconds: clip.length,
        });
    } finally {
      recording = false;
      // Stop recording and close every context, including failed captures.
      if (stream) await stream.send('Page.stopScreencast').catch(() => {});
      await context.close();
    }
  }
  if (video) {
    if (!filter) {
      console.log('Rendering integration features…');
      await titleCard('capabilities');
      console.log('Rendering closing card…');
      await titleCard('outro');
    }
    const list = manifest.sequence.map((scene) => `file '${scene.id}.mp4'`).join('\n');
    await writeFile(path.join(scratch, 'clips.txt'), list);
    const filename = filter ? `granum-grid-${filter}.mp4` : 'granum-grid-launch.mp4';
    manifest.video = `media/output/${filename}`;
    const duration = manifest.sequence.reduce((sum, item) => sum + item.seconds, 0);
    const scoreName = filename.replace('.mp4', '-score.wav');
    console.log(`Mixing ${soundtrack.title} by ${soundtrack.artist}…`);
    manifest.audio = {
      ...(await renderSoundtrack(path.join(scratch, scoreName), duration, { encode: run, ffmpeg })),
      mix: 'AAC stereo, 192 kb/s, two-pass -16 LUFS target, -2.5 dBTP master ceiling',
    };
    await runFFmpeg(
      concatList(path.join(scratch, 'clips.txt')),
      ['-i', path.join(scratch, scoreName)],
      ['-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy'],
      ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000'],
      ['-shortest', '-movflags', '+faststart'],
      path.join(scratch, filename),
    );
    await rename(path.join(scratch, filename), path.join(output, filename));
    await writeFile(
      path.join(output, filename.replace('.mp4', '-description.txt')),
      `Granum Grid is a frontend-only React/TypeScript playground for exploring large indexed datasets. Jump to a row, search, compare ranges, and save a bookmark. The UI and navigation run in the browser; the playground needs no Granum Grid backend.\n\nThe film uses generated demonstration data. Sampled summaries and partial search are labeled. The playground's Bitcoin and Hacker News examples call external public APIs directly. The repository also includes a separate local HTTP teaching example; it is not a deployed backend. Integrations supply their own data provider.\n\n${soundtrack.credit}\nTrack: ${soundtrack.source}\nMusic edited to picture at phrase boundaries, with crossfades and loudness adjustment.\n\nMusic credit is included for provenance; Mixkit does not require attribution.\n`,
    );
    const cueTime = (seconds) => {
      const ms = Math.round(seconds * 1000);
      return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
    };
    let position = 0;
    const captions = manifest.sequence
      .map((scene, i) => {
        const start = position;
        position += scene.seconds;
        return `${i + 1}\n${cueTime(start)} --> ${cueTime(position)}\n${scene.title}\n`;
      })
      .join('\n');
    await writeFile(path.join(output, filename.replace('.mp4', '.srt')), captions);
    console.log(
      `Video: media/output/${filename} (${position.toFixed(1)}s, 1920×1080, licensed music)`,
    );
  }
  if (screenshots) {
    for (const scene of manifest.scenes)
      await rename(path.join(scratch, `${scene.id}.png`), path.join(images, `${scene.id}.png`));
    console.log(`Screenshots: media/images/ (${manifest.scenes.length})`);
  }
  await writeFile(
    path.join(output, `manifest-${mode}${filter ? `-${filter}` : ''}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
} catch (error) {
  failed = true;
  console.error(error);
  if (scratch) console.error(`Incomplete capture retained for inspection: ${scratch}`);
  process.exitCode = 1;
} finally {
  try {
    await browser?.close();
  } finally {
    await server?.close();
    if (scratch && !failed) await rm(scratch, { recursive: true, force: true });
  }
}
