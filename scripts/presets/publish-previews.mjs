import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { options, buildPlan, readRecord, matches, atomicJson, isMain, root } from './common.mjs';
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
    const preview = { url: `${key}.mp4`, poster: `${key}.png`, run: `runs/${plan.id}.json` };
    if (dryRun) { log(JSON.stringify({ input: record.output_path, upload: preview, write: plan.path })); continue; }
    const media = await encode(record.output_path);
    preview.url = await upload(`${key}.mp4`, media.video, 'video/mp4');
    preview.poster = await upload(`${key}.png`, media.poster, 'image/png');
    await atomicJson(plan.path, { ...plan.preset, preview });
    changed = true;
  }
  if (changed) { await regenerate(); }
}
async function encode(inputPath) {
  const { transformMedia, pngFrames, probeMedia } = await import('@nodetool-ai/runtime/media');
  const outPath = `${inputPath}.preview.mp4`;
  await mkdir(dirname(outPath), { recursive: true });
  const info = await probeMedia(inputPath);
  if (info.durationSec === null || info.durationSec < 2) { throw new Error('Preview source must be at least two seconds'); }
  await transformMedia({ inputs: [{ filePath: inputPath, toSec: 3 }], outPath,
    video: { filter: 'trim=duration=3,setpts=PTS-STARTPTS' }, audio: null,
    videoEncoder: { codec: 'libx264', pixelFormat: 'yuv420p' }, muxerOptions: { movflags: '+faststart' } });
  for await (const poster of pngFrames({ filePath: outPath, limit: 1 })) {
    await writeFile(`${inputPath}.poster.png`, poster);
    return { video: await readFile(outPath), poster };
  }
  throw new Error('No poster frame decoded');
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
    regenerate: () => promisify(execFile)(process.execPath, ['packages/presets/scripts/generate.mjs'], { cwd: root }) });
}
if (isMain(import.meta.url)) { main().catch((error) => { console.error(error.message); process.exitCode = 1; }); }
