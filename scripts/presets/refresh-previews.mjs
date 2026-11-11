/**
 * One pass over the published preset previews:
 *
 * - A PNG poster is resized, stored as a JPEG beside it and the preset JSON
 *   points at the JPEG. The PNG stays in the bucket for older clients.
 * - A clip or poster stored without the upload Cache-Control is written back
 *   under the same key, which keeps its URL and gives it the header.
 *
 * Safe to re-run: a JPEG poster with the header and a clip with the header
 * are left alone.
 */
import { catalogFiles, atomicJson, isMain, root } from './common.mjs';
import { posterJpeg } from './publish-previews.mjs';
import { parseArgs, promisify } from 'node:util';
import { execFile } from 'node:child_process';

/** The bucket key of a public preview URL, or null for any other URL. */
export function previewKey(url, publicBase) {
  return typeof url === 'string' && url.startsWith(publicBase) ? url.slice(publicBase.length) : null;
}

export async function refreshPreviews(files, { adapter, publicBase, cacheControl, dryRun, log = console.log }) {
  const changed = [];
  const current = async (key) => (await adapter.stat(adapter.uriForKey(key)))?.cacheControl === cacheControl;
  for (const { path, preset } of files) {
    const preview = preset.preview;
    if (!preview) { continue; }
    const next = { ...preview };
    const videoKey = previewKey(preview.url, publicBase);
    if (videoKey && !(await current(videoKey))) {
      log(`${preset.id}: ${dryRun ? 'would rewrite' : 'rewriting'} ${videoKey}`);
      if (!dryRun) {
        const bytes = await adapter.retrieve(adapter.uriForKey(videoKey));
        if (!bytes) { throw new Error(`${videoKey} is missing from the bucket`); }
        await adapter.store(videoKey, bytes, 'video/mp4');
      }
    }
    const posterKey = previewKey(preview.poster, publicBase);
    if (posterKey?.endsWith('.png')) {
      const jpegKey = `${posterKey.slice(0, -'.png'.length)}.jpg`;
      log(`${preset.id}: ${dryRun ? 'would convert' : 'converting'} ${posterKey} -> ${jpegKey}`);
      if (!dryRun) {
        const png = await adapter.retrieve(adapter.uriForKey(posterKey));
        if (!png) { throw new Error(`${posterKey} is missing from the bucket`); }
        await adapter.store(jpegKey, await posterJpeg(png), 'image/jpeg');
        next.poster = `${publicBase}${jpegKey}`;
      }
    } else if (posterKey && !(await current(posterKey))) {
      log(`${preset.id}: ${dryRun ? 'would rewrite' : 'rewriting'} ${posterKey}`);
      if (!dryRun) {
        const bytes = await adapter.retrieve(adapter.uriForKey(posterKey));
        if (!bytes) { throw new Error(`${posterKey} is missing from the bucket`); }
        await adapter.store(posterKey, bytes, 'image/jpeg');
      }
    }
    if (next.poster !== preview.poster) {
      await atomicJson(path, { ...preset, preview: next });
      changed.push(preset.id);
    }
  }
  return changed;
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { 'dry-run': { type: 'boolean' } } });
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: apiKey, PRESET_PREVIEWS_BUCKET: bucket } = process.env;
  if (!url || !apiKey || !bucket) { throw new Error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and PRESET_PREVIEWS_BUCKET (public bucket)'); }
  const { SupabaseStorageAdapter, objectCacheControl } = await import('@nodetool-ai/storage');
  const adapter = new SupabaseStorageAdapter({ url, apiKey, bucket });
  const publicBase = adapter.getPublicUrl(adapter.uriForKey('x')).slice(0, -1);
  const changed = await refreshPreviews(await catalogFiles(), {
    adapter, publicBase, cacheControl: objectCacheControl(), dryRun: values['dry-run']
  });
  if (changed.length > 0) {
    // The generator runs on plain node, so it must not inherit the dev source condition.
    await promisify(execFile)(process.execPath, ['packages/presets/scripts/generate.mjs'], {
      cwd: root, env: { ...process.env, NODE_OPTIONS: '' } });
  }
  console.log(`${changed.length} preset JSON files point at a new poster`);
}
if (isMain(import.meta.url)) { main().catch((error) => { console.error(error.message); process.exitCode = 1; }); }
