import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { atomicJson } from '../presets/common.mjs';
import { refreshPreviews, previewKey } from '../presets/refresh-previews.mjs';

const BASE = 'https://p.supabase.co/storage/v1/object/public/preset-previews/';
const CACHE = 'max-age=604800';

/** An in-memory bucket that records each write. */
function bucket(objects) {
  const stores = [];
  return {
    stores,
    uriForKey: (key) => `mem://${key}`,
    stat: async (uri) => {
      const object = objects.get(uri.slice(6));
      return object ? { key: uri.slice(6), size: object.bytes.length, modifiedAt: 0, cacheControl: object.cacheControl } : null;
    },
    retrieve: async (uri) => objects.get(uri.slice(6))?.bytes ?? null,
    store: async (key, bytes, contentType) => {
      stores.push({ key, contentType, size: bytes.length });
      objects.set(key, { bytes, cacheControl: CACHE });
      return `mem://${key}`;
    }
  };
}

async function png() {
  const { loadSharpOrThrow } = await import('@nodetool-ai/runtime');
  const sharp = await loadSharpOrThrow();
  return sharp({ create: { width: 1920, height: 1080, channels: 3, background: '#808080' } }).png().toBuffer();
}

async function withPreset(preview, run) {
  const dir = await mkdtemp(resolve(tmpdir(), 'preset-refresh-'));
  try {
    const path = resolve(dir, 'preset.json');
    const preset = { id: 'look.test', kind: 'look', preview };
    await atomicJson(path, preset);
    await run({ path, preset });
  } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('refreshPreviews', () => {
  it('reads keys only from the public bucket base', () => {
    expect(previewKey(`${BASE}presets/a/h.mp4`, BASE)).toBe('presets/a/h.mp4');
    expect(previewKey('https://elsewhere.example/h.mp4', BASE)).toBeNull();
  });

  it('stores a resized JPEG poster, rewrites a no-cache clip, and points the preset at the JPEG', () => withPreset(
    { url: `${BASE}presets/look.test/h.mp4`, poster: `${BASE}presets/look.test/h-late.png`, run: 'runs/look.test.json' },
    async (file) => {
      const adapter = bucket(new Map([
        ['presets/look.test/h.mp4', { bytes: Buffer.from('clip'), cacheControl: 'no-cache' }],
        ['presets/look.test/h-late.png', { bytes: await png(), cacheControl: 'no-cache' }]
      ]));
      const changed = await refreshPreviews([file], { adapter, publicBase: BASE, cacheControl: CACHE, log: () => {} });
      expect(changed).toEqual(['look.test']);
      expect(adapter.stores.map(({ key, contentType }) => ({ key, contentType }))).toEqual([
        { key: 'presets/look.test/h.mp4', contentType: 'video/mp4' },
        { key: 'presets/look.test/h-late.jpg', contentType: 'image/jpeg' }
      ]);
      const { loadSharpOrThrow } = await import('@nodetool-ai/runtime');
      const sharp = await loadSharpOrThrow();
      const jpeg = await adapter.retrieve('mem://presets/look.test/h-late.jpg');
      expect(await sharp(jpeg).metadata()).toMatchObject({ format: 'jpeg', width: 960 });
      const written = JSON.parse(await readFile(file.path, 'utf8'));
      expect(written.preview).toEqual({ ...file.preset.preview, poster: `${BASE}presets/look.test/h-late.jpg` });
    }));

  it('leaves current objects alone and writes nothing on a dry run', () => withPreset(
    { url: `${BASE}presets/look.test/h.mp4`, poster: `${BASE}presets/look.test/h.jpg` },
    async (file) => {
      const adapter = bucket(new Map([
        ['presets/look.test/h.mp4', { bytes: Buffer.from('clip'), cacheControl: CACHE }],
        ['presets/look.test/h.jpg', { bytes: Buffer.from('jpg'), cacheControl: 'no-cache' }]
      ]));
      const dry = await refreshPreviews([file], { adapter, publicBase: BASE, cacheControl: CACHE, dryRun: true, log: () => {} });
      expect(dry).toEqual([]);
      expect(adapter.stores).toEqual([]);
      await refreshPreviews([file], { adapter, publicBase: BASE, cacheControl: CACHE, log: () => {} });
      expect(adapter.stores.map(({ key }) => key)).toEqual(['presets/look.test/h.jpg']);
    }));
});
