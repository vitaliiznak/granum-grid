import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const soundtrack = {
  title: 'Firefly',
  artist: 'Scott Buckley',
  source: 'https://www.scottbuckley.com.au/library/firefly/',
  download: 'https://www.scottbuckley.com.au/wp-content/audio/sb_firefly.mp3',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  sha256: 'ba145cfa16c6fdf3e587bf11bd3ed929214e689e7f382ab5373daf518b3116f5',
  credit: "'Firefly' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au",
};
const source = fileURLToPath(new URL('../output/music/firefly.mp3', import.meta.url));
const hash = (data) => createHash('sha256').update(data).digest('hex');

export async function soundtrackSource() {
  let data;
  try {
    data = await readFile(source);
  } catch {
    throw new Error('Download the licensed music first: node media/scripts/soundtrack.mjs fetch');
  }
  if (hash(data) !== soundtrack.sha256)
    throw new Error('Soundtrack checksum changed. Verify its source and license before using it.');
  return source;
}

export async function renderSoundtrack(file, seconds, { encode, ffmpeg }) {
  const input = await soundtrackSource();
  const fades = `atrim=duration=${seconds},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.7,afade=t=out:st=${Math.max(0, seconds - 4)}:d=4`;
  // Measure the actual edit first. One-pass dynamic normalization can miss its
  // integrated target; a measured second pass keeps the music level consistent.
  const analysis = await encode(ffmpeg, [
    '-hide_banner',
    '-nostats',
    '-stream_loop',
    '-1',
    '-i',
    input,
    '-t',
    String(seconds),
    '-af',
    `${fades},loudnorm=I=-17:TP=-2:LRA=7:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const measured = JSON.parse(
    analysis.slice(analysis.lastIndexOf('{'), analysis.lastIndexOf('}') + 1),
  );
  const normalize = `loudnorm=I=-17:TP=-2:LRA=7:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await encode(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    '-stream_loop',
    '-1',
    '-i',
    input,
    '-t',
    String(seconds),
    '-af',
    `${fades},${normalize}`,
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s16le',
    file,
  ]);
  return {
    ...soundtrack,
    changes:
      'Trimmed to picture, faded in/out, loudness adjusted; looped only if longer than source.',
    sampleRate: 48000,
    channels: 2,
    seconds,
  };
}

// Explicit download step keeps ordinary capture offline and the original recording
// out of version control. Only the synchronized film is a deliverable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== 'fetch')
    throw new Error('Usage: node media/scripts/soundtrack.mjs fetch');
  const response = await fetch(soundtrack.download, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Music download failed: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (hash(data) !== soundtrack.sha256) throw new Error('Downloaded music checksum did not match.');
  await mkdir(new URL('../output/music/', import.meta.url), { recursive: true });
  await writeFile(`${source}.tmp`, data);
  await rename(`${source}.tmp`, source);
  console.log(`Cached ${soundtrack.title} by ${soundtrack.artist}. ${soundtrack.license}.`);
}
