import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const mode = process.argv[2] ?? 'screenshots';
const filter = process.argv
  .slice(3)
  .find((arg) => arg.startsWith('--scene='))
  ?.slice(8);
if (
  !['screenshots', 'video', 'all'].includes(mode) ||
  process.argv.slice(3).some((arg) => !arg.startsWith('--scene='))
) {
  throw new Error('Usage: node media/scripts/capture.mjs screenshots|video|all [--scene=hero]');
}
const video = mode !== 'screenshots';
const screenshots = mode !== 'video';
const output = path.join(root, 'media/output');
const images = path.join(root, 'media/images');
const size = { width: 1920, height: 1080 };
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
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr}`)),
    );
  });
}
const pause = (page, milliseconds) => page.waitForTimeout(milliseconds);
async function settled(page) {
  await page.waitForFunction(() => {
    const state = window.__deepscrollMedia?.controller?.getSnapshot();
    return state && !state.moving && document.querySelector('.stage')?.dataset.ready === 'true';
  });
  await page.locator('.ds-meta-error').waitFor({ state: 'hidden' });
  await page.evaluate(() => document.fonts.ready);
}

async function perform(page, scene, filming) {
  const hold = (ms) => (filming ? pause(page, ms) : Promise.resolve());
  await hold(650);
  if (scene.action === 'jump') {
    if (scene.id === 'jump') {
      await page.getByRole('button', { name: /Go to…/ }).click();
      const input = page.getByRole('textbox', { name: 'Go to row, date, or event' });
      await input.pressSequentially('73,500,000', { delay: filming ? 75 : 0 });
      await hold(550);
      await input.press('Enter');
    } else {
      await page.evaluate(
        (target) => window.__deepscrollMedia.controller.goTo(target),
        scene.target,
      );
    }
    await page.waitForFunction((target) => {
      const s = window.__deepscrollMedia.controller.getSnapshot();
      return !s.moving && s.activeIndex === target;
    }, scene.target);
    await page
      .locator(`[role="row"][aria-rowindex="${scene.target + 1}"][data-status="ready"]`)
      .waitFor();
  } else if (scene.action === 'overview') {
    await page.evaluate(() => window.__deepscrollMedia.fit());
    await page.waitForFunction(() => {
      const s = window.__deepscrollMedia.controller.getSnapshot();
      return s.view === 'zoom' && s.rowsPerPixel > 1;
    });
  } else if (scene.action === 'lens') {
    await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('lens');
  } else if (scene.action === 'search') {
    await page.getByRole('button', { name: /Go to…/ }).click();
    const input = page.getByRole('textbox', { name: 'Go to row, date, or event' });
    await input.pressSequentially('status >= 500', { delay: filming ? 55 : 0 });
    await page
      .getByRole('button', { name: /^status 50\d/ })
      .first()
      .waitFor();
    await hold(1000);
    // Leave results visible for the README; the film also visits a matching row.
    if (filming) {
      await input.press('Enter');
      await page
        .locator('.ds-row[data-focused] .lg-status')
        .filter({ hasText: /^50\d$/ })
        .waitFor();
    }
  } else if (scene.action === 'expand') {
    await page.getByRole('button', { name: `Expand row ${scene.index + 1}`, exact: true }).click();
    await page.locator('.expanded-note').waitFor();
  } else if (scene.action === 'compare') {
    await page.getByRole('button', { name: /^Explore/ }).click();
    const select = async (first, last) => {
      await page.getByLabel('First row', { exact: true }).fill(String(first));
      await page.getByLabel('Last row', { exact: true }).fill(String(last));
      await page.getByRole('button', { name: 'Select range', exact: true }).click();
      await page.getByText('Estimated summary', { exact: true }).waitFor();
    };
    await select(1_000_000, 1_000_100);
    await page.getByRole('button', { name: 'Use as comparison A', exact: true }).click();
    await select(61_700_000, 61_700_100);
    await hold(300);
    await page.getByRole('button', { name: 'Compare A with selection', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Compare selected ranges' });
    await dialog
      .getByRole('grid', { name: 'Range A rows' })
      .locator('[data-status="ready"]')
      .first()
      .waitFor();
    await dialog
      .getByRole('grid', { name: 'Range B rows' })
      .locator('[data-status="ready"]')
      .first()
      .waitFor();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.ds-compare [role="status"]')].filter(
          (node) => node.textContent === 'Estimated summary',
        ).length === 2,
    );
  } else if (filming) {
    await page.getByRole('grid').hover();
    for (let i = 0; i < 18; i++) {
      await page.mouse.wheel(0, 10);
      await pause(page, 45);
    }
  }
  await settled(page);
  // Let worker summaries and canvas paints finish; data readiness is checked above.
  await pause(page, 500);
  await page.mouse.move(1880, 1040);
}

let server;
let browser;
let scratch;
let failed = false;
const manifest = {
  generatedAt: new Date().toISOString(),
  viewport: size,
  synthetic: true,
  scenes: [],
};
try {
  if (video) {
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
  server = await createServer({
    configFile: path.join(root, 'media/vite.config.ts'),
    server: { port: 0, strictPort: false, open: false },
    logLevel: 'error',
  });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const discovery = await browser.newPage();
  let scenes;
  try {
    await discovery.goto(`${url}?capture=1`);
    await discovery.waitForFunction(() => window.__deepscrollMedia);
    scenes = await discovery.evaluate(() => window.__deepscrollMedia.scenes);
  } finally {
    await discovery.close();
  }
  if (filter) scenes = scenes.filter((scene) => scene.id === filter);
  if (!scenes.length) throw new Error(`Unknown scene: ${filter}`);

  for (const scene of scenes) {
    console.log(`Capturing ${scene.id}…`);
    const context = await browser.newContext({
      viewport: size,
      deviceScaleFactor: 1,
      locale: 'en-US',
      timezoneId: 'UTC',
      reducedMotion: 'no-preference',
      colorScheme: scene.theme ?? 'light',
    });
    let page;
    let encoder;
    let encoderDone;
    let stream;
    let recording = false;
    let began;
    let ended;
    const errors = [];
    try {
      page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`${url}?capture=1&scene=${scene.id}`);
      await settled(page);
      await page.locator('[role="row"][data-status="ready"]').first().waitFor();
      await pause(page, 450);
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
          await run(ffmpeg, [
            '-y',
            '-loglevel',
            'error',
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            path.join(frameDir, 'frames.txt'),
            '-vf',
            `fps=30,fade=t=in:st=0:d=0.2,fade=t=out:st=${Math.max(0, length - 0.2)}:d=0.2`,
            '-t',
            length.toFixed(3),
            '-c:v',
            'libx264',
            '-preset',
            'fast',
            '-crf',
            '19',
            '-pix_fmt',
            'yuv420p',
            '-an',
            clip,
          ]);
          return { clip, length };
        };
      }
      await perform(page, scene, video);
      if (screenshots) {
        // In all-mode preserve the same search-results still as screenshots-only mode.
        if (scene.action === 'search' && video) {
          await pause(page, Math.max(1000, scene.seconds * 1000 - (Date.now() - began)));
          encoderDone = encoder();
          await page.getByRole('button', { name: /Go to…/ }).click();
          await page
            .getByRole('textbox', { name: 'Go to row, date, or event' })
            .fill('status >= 500');
          await page
            .getByRole('button', { name: /^status 50\d/ })
            .first()
            .waitFor();
        }
        await page.screenshot({
          path: path.join(scratch, `${scene.id}.png`),
          animations: 'disabled',
        });
      }
      let clip;
      if (video) {
        if (!encoderDone) {
          await pause(page, Math.max(1000, scene.seconds * 1000 - (Date.now() - began)));
          encoderDone = encoder();
        }
        clip = await encoderDone;
      }
      if (errors.length) throw new Error(`${scene.id} browser errors:\n${errors.join('\n')}`);
      manifest.scenes.push({
        id: scene.id,
        title: scene.title.replace('\n', ' '),
        seconds: clip?.length,
        screenshot: screenshots ? `media/images/${scene.id}.png` : undefined,
      });
    } finally {
      recording = false;
      // Stop recording and close every context, including failed captures.
      if (stream) await stream.send('Page.stopScreencast').catch(() => {});
      await context.close();
    }
  }
  if (video) {
    const list = manifest.scenes.map((scene) => `file '${scene.id}.mp4'`).join('\n');
    await writeFile(path.join(scratch, 'clips.txt'), list);
    const filename = filter ? `deepscroll-${filter}.mp4` : 'deepscroll-launch.mp4';
    manifest.video = `media/output/${filename}`;
    await run(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      path.join(scratch, 'clips.txt'),
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      path.join(scratch, filename),
    ]);
    await rename(path.join(scratch, filename), path.join(output, filename));
    const cueTime = (seconds) => {
      const ms = Math.round(seconds * 1000);
      return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
    };
    let position = 0;
    const captions = manifest.scenes
      .map((scene, i) => {
        const start = position;
        position += scene.seconds;
        return `${i + 1}\n${cueTime(start)} --> ${cueTime(position)}\n${scene.title}\n`;
      })
      .join('\n');
    await writeFile(path.join(output, filename.replace('.mp4', '.srt')), captions);
    console.log(`Video: media/output/${filename} (${position.toFixed(1)}s, 1920×1080, silent)`);
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
