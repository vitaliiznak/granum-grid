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
const explorer = (page) => page.locator('.demo-explorer').first();
async function settled(page) {
  await explorer(page).waitFor();
  await page.waitForFunction(() => {
    const root = document.querySelector('.demo-explorer');
    return (
      root &&
      !root.querySelector('[data-status="loading"], [data-status="error"]') &&
      !root.querySelector('.ds-meta-error') &&
      !root.querySelector('.ds-legend')?.textContent.includes('loading') &&
      !root.textContent.includes('Traveling through the overview')
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
  await page.goto(`${url}?capture=1&scene=${scene.id}${filming ? '&film=1' : ''}`);
  await settled(page);
  await explorer(page).locator('[role="row"][data-status="ready"]').first().waitFor();
  if (scene.theme === 'dark')
    await page.getByRole('button', { name: 'Toggle color theme' }).click();
  if (scene.action === 'expand') {
    await page.getByRole('checkbox', { name: 'Dynamic row heights', exact: true }).check();
    await settled(page);
  }
  // Move the camera to the table, without changing the product's CSS or markup.
  await explorer(page).evaluate((node) =>
    node.scrollIntoView({ block: 'start', behavior: 'instant' }),
  );
  await pause(page, 400);
  await page.mouse.move(20, 20);
  return explorer(page).boundingBox();
}
async function perform(page, scene, filming) {
  const hold = (ms) => (filming ? pause(page, ms) : Promise.resolve());
  const table = explorer(page);
  await hold(650);
  if (scene.action === 'jump') {
    await click(page, table.getByRole('button', { name: /Go to…/ }));
    const input = page.getByRole('textbox', { name: 'Go to row, date, or event' });
    const query =
      scene.id === 'jump'
        ? '73,500,000'
        : scene.id === 'genome'
          ? 'BRCA1'
          : scene.id === 'market'
            ? 'Flash crash'
            : 'Sirius';
    await input.pressSequentially(query, { delay: filming ? 75 : 0 });
    await page
      .locator('.ds-jump-results button')
      .filter({ hasText: `Row ${(scene.target + 1).toLocaleString('en-US')}` })
      .waitFor();
    await hold(550);
    await input.press('Enter');
    await table
      .locator(`[role="row"][aria-rowindex="${scene.target + 1}"][data-status="ready"]`)
      .waitFor();
  } else if (scene.action === 'overview') {
    await table.getByRole('combobox', { name: 'View', exact: true }).selectOption('zoom');
    await click(page, table.getByRole('button', { name: 'Fit dataset', exact: true }));
  } else if (scene.action === 'lens') {
    await table.getByRole('combobox', { name: 'View', exact: true }).selectOption('lens');
  } else if (scene.action === 'search') {
    await click(page, table.getByRole('button', { name: /Go to…/ }));
    const input = page.getByRole('textbox', { name: 'Go to row, date, or event' });
    await input.pressSequentially('status >= 500', { delay: filming ? 55 : 0 });
    await page
      .getByRole('button', { name: /^status 50\d/ })
      .first()
      .waitFor();
    await hold(1200);
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
    const select = async (first, last) => {
      await click(page, page.getByRole('button', { name: /^Enter row numbers/ }));
      await page.getByLabel('From row', { exact: true }).fill(String(first));
      await page.getByLabel('To row', { exact: true }).fill(String(last));
      await click(page, page.getByRole('button', { name: 'Use these rows', exact: true }));
    };
    await select(1_000_000, 1_000_100);
    await click(page, page.getByRole('button', { name: 'Compare ranges', exact: true }));
    await click(page, page.getByRole('button', { name: 'Choose second range', exact: true }));
    await select(61_700_000, 61_700_100);
    await hold(300);
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
      await hold(600);
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
  await page.mouse.move(20, 20);
  if (scene.action === 'compare') {
    await page.getByRole('dialog', { name: 'Compare selected ranges' }).screenshot({ path: file });
  } else if (scene.action === 'search') {
    const table = await explorer(page).boundingBox();
    const dialog = await page.getByRole('dialog', { name: 'Jump to a location' }).boundingBox();
    const left = Math.min(table.x, dialog.x),
      top = Math.min(table.y, dialog.y);
    await page.screenshot({
      path: file,
      clip: {
        x: left,
        y: top,
        width: Math.max(table.x + table.width, dialog.x + dialog.width) - left,
        height: Math.max(table.y + table.height, dialog.y + dialog.height) - top,
      },
    });
  } else if (scene.id === 'hero') {
    await page.evaluate(() => window.scrollTo(0, 0));
    const header = await page.locator('.site-header').boundingBox();
    const table = await explorer(page).boundingBox();
    await page.screenshot({
      path: file,
      fullPage: true,
      clip: { x: header.x, y: 0, width: header.width, height: table.y + table.height + 1 },
    });
  } else {
    await explorer(page).screenshot({ path: file, animations: 'disabled' });
  }
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
  sequence: [],
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
  let titleCards;
  let filmWindow;
  try {
    await discovery.goto(`${url}?capture=1`);
    await discovery.waitForFunction(() => window.__deepscrollMedia);
    ({ scenes, titleCards, filmWindow } = await discovery.evaluate(() => window.__deepscrollMedia));
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
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`${url}?artwork=${card ? id : 'scene'}&scene=${id}&plate=1`);
      await page.locator('.film-canvas').waitFor();
      await page.evaluate(() => document.fonts.ready);
      const file = path.join(scratch, `${id}-artwork.png`);
      await page.screenshot({ path: file });
      if (errors.length) throw new Error(`${id} artwork errors:\n${errors.join('\n')}`);
      return file;
    } finally {
      await context.close();
    }
  }
  async function titleCard(id) {
    const card = titleCards.find((item) => item.id === id);
    const image = await artwork(id, true);
    await run(ffmpeg, [
      '-y',
      '-loglevel',
      'error',
      '-loop',
      '1',
      '-framerate',
      '30',
      '-i',
      image,
      '-vf',
      `scale=3840:2160,zoompan=z='1+0.00006*on':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1920x1080:fps=30,fade=t=in:st=0:d=0.25,fade=t=out:st=${card.seconds - 0.3}:d=0.3`,
      '-t',
      String(card.seconds),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '19',
      '-pix_fmt',
      'yuv420p',
      '-an',
      path.join(scratch, `${id}.mp4`),
    ]);
    manifest.sequence.push({ ...card, kind: 'title' });
  }
  if (video && !filter) {
    console.log('Rendering opening card…');
    await titleCard('intro');
  }

  for (const scene of scenes) {
    console.log(`Capturing ${scene.id}…`);
    const background = video ? await artwork(scene.id) : undefined;
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
            scene.action === 'compare'
              ? ''
              : `crop=${Math.round(camera.width)}:${Math.round(camera.height)}:${Math.round(camera.x)}:${Math.round(camera.y)},`;
          const { x, y, width, height } = filmWindow;
          await run(ffmpeg, [
            '-y',
            '-loglevel',
            'error',
            '-loop',
            '1',
            '-framerate',
            '30',
            '-i',
            background,
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            path.join(frameDir, 'frames.txt'),
            '-filter_complex',
            `[1:v]${crop}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x151c18,setsar=1[live];[0:v][live]overlay=${x}:${y}:shortest=1,fade=t=in:st=0:d=0.18,fps=30[film]`,
            '-map',
            '[film]',
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
      let clip;
      if (video) {
        await pause(page, Math.max(1000, scene.seconds * 1000 - (Date.now() - began)));
        clip = await encoder();
      }
      if (screenshots) {
        // Always capture the same deterministic still, independently of the film's end state.
        if (video) {
          await prepare(page, url, scene, false);
          await perform(page, scene, false);
        }
        await still(page, scene, path.join(scratch, `${scene.id}.png`));
      }
      if (errors.length) throw new Error(`${scene.id} browser errors:\n${errors.join('\n')}`);
      manifest.scenes.push({
        id: scene.id,
        title: scene.title.replace('\n', ' '),
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
      console.log('Rendering closing card…');
      await titleCard('outro');
    }
    const list = manifest.sequence.map((scene) => `file '${scene.id}.mp4'`).join('\n');
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
    const captions = manifest.sequence
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
