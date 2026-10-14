import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const soundtrack = {
  title: 'Gear',
  artist: 'Andrew Ev',
  source: 'https://mixkit.co/free-stock-music/tag/corporate/',
  download: 'https://assets.mixkit.co/music/180/180.mp3',
  license: 'Mixkit Stock Music Free License',
  licenseUrl: 'https://mixkit.co/license/#musicFree',
  sha256: 'ca98345f45b8703dd7713d0ac3ef330c3760922c8e7c1f8cae1deb950be603f5',
  credit:
    'Music: "Gear" by Andrew Ev, from Mixkit.\nMixkit Stock Music Free License: https://mixkit.co/license/#musicFree',
};
const source = fileURLToPath(new URL('../output/music/gear.mp3', import.meta.url));
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
  // Gear is 127 BPM. Keep its opening hook, the build and first drop, then
  // the final full arrangement. Cuts fall on 8- and 16-bar boundaries;
  // short crossfades avoid clicks without softening the beat.
  const phrase = (60 / 127) * 4 * 16;
  const inputs = [
    '-i',
    input,
    '-ss',
    String(phrase * 2),
    '-i',
    input,
    '-stream_loop',
    '-1',
    '-ss',
    String(phrase * 6.5),
    '-i',
    input,
  ];
  const edit = [
    `[0:a]atrim=duration=${phrase},asetpts=PTS-STARTPTS[hook]`,
    `[1:a]atrim=duration=${phrase * 2},asetpts=PTS-STARTPTS[build]`,
    `[2:a]atrim=duration=${seconds},asetpts=PTS-STARTPTS[finish]`,
    '[hook][build]acrossfade=d=0.025:c1=tri:c2=tri[first]',
    '[first][finish]acrossfade=d=0.025:c1=tri:c2=tri',
  ].join(';');
  const fades = `atrim=duration=${seconds},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.12,afade=t=out:st=${Math.max(0, seconds - 4)}:d=4`;
  // Measure the actual edit first. One-pass dynamic normalization can miss its
  // integrated target; a measured second pass keeps the music level consistent.
  const analysis = await encode(ffmpeg, [
    '-hide_banner',
    '-nostats',
    ...inputs,
    '-t',
    String(seconds),
    '-filter_complex',
    `${edit},${fades},loudnorm=I=-16:TP=-2.5:LRA=7:print_format=json[out]`,
    '-map',
    '[out]',
    '-f',
    'null',
    '-',
  ]);
  const measured = JSON.parse(
    analysis.slice(analysis.lastIndexOf('{'), analysis.lastIndexOf('}') + 1),
  );
  const normalize = `loudnorm=I=-16:TP=-2.5:LRA=7:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
  await encode(ffmpeg, [
    '-y',
    '-loglevel',
    'error',
    ...inputs,
    '-t',
    String(seconds),
    '-filter_complex',
    `${edit},${fades},${normalize}[out]`,
    '-map',
    '[out]',
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
      'Phrase edit: opening hook, build and drop, final full arrangement; 25 ms joins, fades and loudness adjustment. Final source loops only for extended captures.',
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
