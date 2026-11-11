import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import * as webAudio from 'node-web-audio-api';

const [root, fixture, binary] = process.argv.slice(2);
const repo = path.resolve(root, '../..');
const work = fs.mkdtempSync(path.join(path.dirname(path.resolve(binary)), 'd2-mix-'));
Object.assign(globalThis, webAudio);
try {
  // Use the same web render entry and instrument exclusions as P1's DSP oracle.
  const entry = path.join(work, 'web-render.mjs');
  await build({
    entryPoints: [path.join(repo, 'web/src/components/timeline/render/renderAudio.ts')],
    outfile: entry, bundle: true, platform: 'node', format: 'esm',
    alias: { '@nodetool-ai/timeline': path.join(repo, 'packages/timeline/src/index.ts') },
    plugins: [{ name: 'no-instruments', setup(b) {
      b.onResolve({ filter: /(?:fableFxUnit|samplerAudio|vstRender|registerFablesynthDevices|liveDevice)$/ }, args =>
        ({ path: args.path, namespace: 'out-of-scope' }));
      b.onLoad({ filter: /.*/, namespace: 'out-of-scope' }, () => ({ contents: `
        export const liveDeviceFactory = () => undefined;
        export const usesFableFx = () => false;
        export const preloadFableFx = async () => {};
        export const buildFableFxNodes = () => { throw Error('fable out of scope'); };
        export const disposeFableFxNodes = () => {};
        export const getSamplerAudio = () => { throw Error('MIDI out of scope'); };
        export const renderVstBuffer = () => { throw Error('VST out of scope'); };
      ` }));
    } }]
  });
  const { renderTimelineAudio } = await import(pathToFileURL(entry));
  const document = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  const sources = new Map(document.clips.map(clip => [clip.id, clip.audioPath || clip.mediaPath]));
  globalThis.fetch = async url => {
    assert.ok(sources.has(url), `Unexpected audio fetch: ${url}`);
    return new Response(fs.readFileSync(sources.get(url)));
  };
  const reference = await renderTimelineAudio({
    ...document, sampleRate: 48000,
    clips: document.clips.map(clip => ({ ...clip, currentAssetId: clip.id })),
    resolveUrl: async id => id
  });
  assert.ok(reference, 'web must render audio');
  const output = path.join(work, 'native.f32');
  execFileSync(binary, [fixture, '--render-audio', output], {
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' }
  });
  const bytes = fs.readFileSync(output);
  assert.equal(bytes.length, reference.length * 8);
  const channels = [reference.getChannelData(0), reference.getChannelData(1)];
  let maxError = 0;
  let energy = 0;
  for (let frame = 0; frame < reference.length; ++frame) {
    for (let channel = 0; channel < 2; ++channel) {
      const actual = bytes.readFloatLE((frame * 2 + channel) * 4);
      const expected = channels[channel][frame];
      assert.ok(Number.isFinite(actual) && Number.isFinite(expected));
      maxError = Math.max(maxError, Math.abs(actual - expected));
      energy += expected * expected;
    }
  }
  assert.ok(energy > 0, 'must compare non-silent audio');
  assert.ok(maxError <= 1e-6, `edited audioEffects differ from web render: max error ${maxError}`);
  console.log(`ok   edited audioEffects vs web render: ${reference.length * 2} samples, max error ${maxError}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
