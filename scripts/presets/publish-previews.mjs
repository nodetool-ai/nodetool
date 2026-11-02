import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { options, buildPlan, readRecord, matches, atomicJson, isMain, root, source } from './common.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function publishPlans(plans, { dryRun, encode, upload, regenerate, log = console.log }) {
  let changed = false;
  for (const plan of plans) {
    const record = await readRecord(plan.recordPath);
    if (!matches(record, plan)) {
      log(`${plan.id}: no current completed render, skipping`);
      continue;
    }
    const key = `presets/${plan.id}/${plan.workflow_hash}`;
    // A look or restyle shows best late in the clip. A new key skips the CDN's copy of an earlier poster.
    const latePoster = plan.preset.kind === 'look' || plan.mode === 'video_edit';
    const posterKey = latePoster ? `${key}-late.png` : `${key}.png`;
    const preview = { url: `${key}.mp4`, poster: posterKey, run: `runs/${plan.id}.json` };
    if (dryRun) { log(JSON.stringify({ input: record.output_path, upload: preview, write: plan.path })); continue; }
    const media = plan.mode === 'image_edit' ? await encodeEdit(source, record.output_path) : await encode(record.output_path, { latePoster });
    preview.url = await upload(`${key}.mp4`, media.video, 'video/mp4');
    preview.poster = await upload(posterKey, media.poster, 'image/png');
    await atomicJson(plan.path, { ...plan.preset, preview });
    changed = true;
  }
  if (changed) { await regenerate(); }
}
async function encode(inputPath, { latePoster = false } = {}) {
  const { transformMedia, pngFrames, probeMedia } = await import('@nodetool-ai/runtime/media');
  const outPath = `${inputPath}.preview.mp4`;
  await mkdir(dirname(outPath), { recursive: true });
  const info = await probeMedia(inputPath);
  if (info.durationSec === null || info.durationSec < 2) { throw new Error('Preview source must be at least two seconds'); }
  await transformMedia({ inputs: [{ filePath: inputPath, toSec: 3 }], outPath,
    video: { filter: 'trim=duration=3,setpts=PTS-STARTPTS' }, audio: null,
    videoEncoder: { codec: 'libx264', pixelFormat: 'yuv420p' }, muxerOptions: { movflags: '+faststart' } });
  let poster = null;
  for await (const frame of pngFrames({ filePath: outPath, limit: 1, ...(latePoster ? { seekSec: 2.5 } : {}) })) { poster = frame; }
  if (!poster) { throw new Error('No poster frame decoded'); }
  await writeFile(`${inputPath}.poster.png`, poster);
  return { video: await readFile(outPath), poster };
}
/**
 * A three-second before-and-after loop for an image edit: the source still,
 * a crossfade, then the edited still. The poster is the edited still.
 */
export async function encodeEdit(beforePath, afterPath, { width = 1280, height = 720, fps = 30 } = {}) {
  const { loadCanvas } = await import('@nodetool-ai/runtime');
  const { openVideoFrameEncoder } = await import('@nodetool-ai/runtime/media');
  const { createCanvas, loadImage } = await loadCanvas();
  const [before, after] = await Promise.all([loadImage(await readFile(beforePath)), loadImage(await readFile(afterPath))]);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  const cover = (image, alpha) => {
    const scale = Math.max(width / image.width, height / image.height);
    context.globalAlpha = alpha;
    context.drawImage(image, (width - image.width * scale) / 2, (height - image.height * scale) / 2, image.width * scale, image.height * scale);
  };
  const outPath = `${afterPath}.preview.mp4`;
  const encoder = await openVideoFrameEncoder({ outPath, fps, input: 'png', spec: { codec: 'libx264', pixelFormat: 'yuv420p' },
    muxerOptions: { movflags: '+faststart' } });
  try {
    const frames = 3 * fps;
    for (let i = 0; i < frames; i++) {
      // Hold the source for 0.8 s, crossfade for 1.4 s, hold the edit to the end.
      const t = Math.min(1, Math.max(0, (i / fps - 0.8) / 1.4));
      cover(before, 1);
      cover(after, t * t * (3 - 2 * t));
      await encoder.write(canvas.toBuffer('image/jpeg', 92));
    }
    await encoder.finish();
  } catch (error) {
    await encoder.abort();
    throw error;
  }
  cover(after, 1);
  const poster = canvas.toBuffer('image/png');
  await writeFile(`${afterPath}.poster.png`, poster);
  return { video: await readFile(outPath), poster };
}
export async function main(args) {
  const opts = options(args);
  let adapter;
  const upload = async (key, bytes, type) => {
    if (!adapter) {
      const { SupabaseStorageAdapter } = await import('@nodetool-ai/storage');
      const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: apiKey, PRESET_PREVIEWS_BUCKET: bucket } = process.env;
      if (!url || !apiKey || !bucket) { throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and PRESET_PREVIEWS_BUCKET (public bucket)'); }
      adapter = new SupabaseStorageAdapter({ url, apiKey, bucket });
    }
    return adapter.getPublicUrl(await adapter.store(key, bytes, type));
  };
  await publishPlans(await buildPlan(opts), { ...opts, encode, upload,
    // The generator runs on plain node, so it must not inherit the dev source condition.
    regenerate: () => promisify(execFile)(process.execPath, ['packages/presets/scripts/generate.mjs'], {
      cwd: root, env: { ...process.env, NODE_OPTIONS: '' } }) });
}
if (isMain(import.meta.url)) { main().catch((error) => { console.error(error.message); process.exitCode = 1; }); }
