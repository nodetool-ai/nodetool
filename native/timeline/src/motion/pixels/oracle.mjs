// Complete synthetic documents through the production web and native exporters.
import assert from 'node:assert/strict';
import { computeActiveLayersWithHorizon } from '@nodetool-ai/timeline/scene';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { matteImports, prepareMatteFixture } from '../../preview/effects/import-matte.mjs';
import { comparePairs, measure } from '../../render2d/check-example-stills.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = path.join(root, 'src/preview/effects/fixtures');
function document(name) {
  const raw = JSON.parse(fs.readFileSync(path.join(fixtures, `${name}.json`), 'utf8'));
  for (const clip of raw.clips) {
    if (clip.mediaPath) clip.mediaPath = path.resolve(fixtures, clip.mediaPath);
    if (clip.generatedMatte?.mediaPath) clip.generatedMatte.mediaPath = path.resolve(fixtures, clip.generatedMatte.mediaPath);
  }
  return raw;
}
export function cases() {
  const nested = document('effects-nested-group');
  const crop = document('clip-crop-chain');
  const repeated = document('matte-moving');
  const picture = repeated.clips.find(clip => clip.id === 'picture');
  picture.repeater = { count: 3, positionStep: { x: 190, y: 0 }, timeStepMs: 100,
    colorStep: { hueDegrees: 24, brightness: 0.04 } };
  picture.transform = { position: { x: -190, y: 0 }, scale: { x: 0.35, y: 0.55 }, rotation: 0,
    anchor: { x: 0.5, y: 0.5 } };
  picture.crop = { left: 0.125, right: 0.125, top: 0.125, bottom: 0.125 };
  picture.effects = [{ id: 'blur', type: 'blur', enabled: true, radius: 8 }];
  const capped = structuredClone(repeated);
  capped.id = 'seq-capped-secondary';
  const video = capped.clips.find(clip => clip.id === 'picture');
  video.mediaType = 'video';
  video.currentAssetId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  video.mediaPath = path.join(root, 'fixtures/media/pip-a-720p.mp4');
  video.repeater.count = 32;
  video.repeater.timeStepMs = 10;
  video.repeater.positionStep.x = 30;
  video.transform.position.x = -105;
  video.transform.scale.x = 0.12;
  const generated = document('generated-matte');
  Object.assign(generated.clips[0], structuredClone({ repeater: picture.repeater, transform: picture.transform,
    crop: picture.crop, effects: picture.effects }));
  return [
    { name: 'nested-groups', document: nested, frames: [21, 0, 15] },
    { name: 'crop-effects', document: crop, frames: [21, 0, 15] },
    { name: 'repeated-secondary', document: repeated, frames: [42, 0, 21] },
    { name: 'capped-video-secondary', document: capped, frames: [42, 0, 21] },
    { name: 'repeated-generated-secondary', document: generated, frames: [42, 0, 21] }
  ];
}
export function assertCoverage(rows) {
  assert.equal(rows.length, 5, 'must inspect every motion pixel fixture');
  const [nested, crop, repeated, capped, generated] = rows.map(row => row.document);
  assert.equal(nested.clips.filter(clip => clip.mediaType === 'group').length, 2);
  assert(nested.clips.some(clip => clip.parentId === 'inner'));
  assert(crop.clips.some(clip => clip.crop && clip.effects.length > 1));
  assert(repeated.clips.some(clip => clip.matte && clip.repeater?.count === 3 && clip.crop && clip.effects.length));
  assert(generated.clips.some(clip => clip.generatedMatte?.status === 'ready' && clip.repeater?.count === 3));
  assert(capped.clips.some(clip => clip.mediaType === 'video' && clip.matte && clip.repeater?.count === 32));
  for (const row of rows) {
    assert(row.frames[0] > row.frames[1], 'exercise backward seek order');
    assert(row.document.clips.some(clip => clip.mediaPath), 'inspect real local sources');
  }
}
export function acceptExpectedCapDrops(error, expected, frameCount) {
  if (error.status !== 1 || !expected.length ||
      !String(error.stderr).includes('golden-import: FAIL: render skipped clips:')) throw error;
  const summaries = String(error.stdout).split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line));
  assert.equal(summaries.length, 1, 'require one completed golden import summary');
  const summary = summaries[0];
  assert.equal(summary.requestedFrames, frameCount);
  assert.equal(summary.stills, frameCount);
  assert(summary.imported > 0);
  assert.deepEqual([...summary.skippedClips].sort(), [...expected].sort(), 'accept only the exact scene-model video-cap drops');
}
export function assertImportedTreatments(original, imported) {
  const expected = structuredClone(original);
  for (const clip of expected.clips) {
    const resolved = imported.clips.find(item => item.id === clip.id);
    assert(resolved, `import must retain clip ${clip.id}`);
    if (clip.mediaPath) {
      assert.match(resolved.currentAssetId, /^[a-f0-9]{32}$/);
      clip.currentAssetId = resolved.currentAssetId;
      delete clip.mediaPath;
    }
    if (clip.generatedMatte?.mediaPath) {
      assert.match(resolved.generatedMatte.assetId, /^[a-f0-9]{32}$/);
      clip.generatedMatte.assetId = resolved.generatedMatte.assetId;
      delete clip.generatedMatte.mediaPath;
    }
  }
  assert.deepEqual(imported, expected, 'reference import may only replace local media paths with scratch asset locators');
}
export function main(argv) {
  const bin = path.resolve(argv[0] ?? path.join(root, 'build-f11/nodetool-timeline'));
  const rows = cases();
  assertCoverage(rows);
  for (const row of rows) {
    for (const clip of row.document.clips) {
      if (clip.mediaPath && (!fs.existsSync(clip.mediaPath) || fs.statSync(clip.mediaPath).size === 0)) {
        throw new Error(`Missing media ${clip.mediaPath}. Run native/timeline/scripts/make-fixtures.sh first.`);
      }
    }
  }
  const run = fs.mkdtempSync(path.join(root, 'build/motion-pixels-'));
  const results = [];
  for (const row of rows) {
    const directory = path.join(run, row.name);
    fs.mkdirSync(directory);
    const fixture = path.join(directory, `${row.name}.json`);
    const before = JSON.stringify(row.document);
    fs.writeFileSync(fixture, before);
    const golden = path.join(directory, 'web');
    const native = path.join(directory, 'native');
    try {
      const times = row.frames.map(frame => frame * 1000 / row.document.fps);
      const plans = JSON.parse(execFileSync(bin, [fixture, '--dump-plan', '--times', times.join(',')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000,
          env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' } }));
      assert.equal(plans.frames.length, row.frames.length);
      const expectedDrops = new Set();
      for (let i = 0; i < times.length; ++i) {
        const web = computeActiveLayersWithHorizon(row.document.tracks, row.document.clips, times[i],
          { canvas: { width: row.document.width, height: row.document.height, fps: row.document.fps } });
        for (const dropped of web.droppedLayers) {
          assert.equal(dropped.reason, 'video_layer_cap', 'no unsupported fields or missing media may be skipped');
          expectedDrops.add(dropped.clipId);
        }
        assert.deepEqual(plans.frames[i].layers.map(layer => layer.clipId).sort(),
          web.layers.map(layer => layer.clipId).sort(), 'both exporters must inspect the same expanded layer IDs');
      }
      if (row.name === 'capped-video-secondary') assert.equal(plans.frames[0].layers.length, 8);
      fs.writeFileSync(path.join(directory, 'native-plan.json'), JSON.stringify(plans, null, 2));
      const mattes = matteImports(row.document, directory);
      let importFixture = fixture;
      if (mattes.length) {
        const prepared = path.join(directory, 'prepared');
        fs.mkdirSync(prepared);
        importFixture = path.join(prepared, `${row.name}.json`);
        fs.writeFileSync(importFixture, JSON.stringify(prepareMatteFixture(row.document, directory)));
      }
      try {
        execFileSync(process.execPath, [path.join(root, 'scripts/golden-import.mjs'), importFixture,
          '--frames', row.frames.join(','), '--out', golden], { stdio: 'pipe', timeout: 240000 });
        assert.equal(expectedDrops.size, 0, 'the exporter must report expected capped copies');
      } catch (error) {
        acceptExpectedCapDrops(error, [...expectedDrops], row.frames.length);
      }
      if (mattes.length) {
        fs.rmSync(path.join(golden, 'stills'), { recursive: true, force: true });
        execFileSync(process.execPath, [path.join(root, 'src/preview/effects/import-matte.mjs'), fixture,
          path.join(golden, `${row.name}.imported.json`), row.frames.join(','), path.join(golden, 'stills'),
          path.resolve(root, '../..'), path.join(root, 'build/golden/store')], { stdio: 'pipe', timeout: 240000 });
      }
      assertImportedTreatments(row.document, JSON.parse(fs.readFileSync(path.join(golden, `${row.name}.imported.json`), 'utf8')));
      execFileSync(bin, [fixture, '--stills', native, '--still-frames', row.frames.join(','), '--decode', 'sw'],
        { stdio: 'pipe', timeout: 120000 });
      assert.equal(fs.readFileSync(fixture, 'utf8'), before, 'render must preserve complete fixture');
      const comparison = comparePairs(row.frames, path.join(golden, 'stills'), native, 40);
      const stillName = frame => `frame_${String(frame).padStart(6, '0')}.png`;
      const independent = path.join(directory, 'native-fresh');
      execFileSync(bin, [fixture, '--stills', independent, '--still-frames', String(row.frames.at(-1)), '--decode', 'sw'],
        { stdio: 'pipe', timeout: 120000 });
      const seekPsnr = measure(path.join(native, stillName(row.frames.at(-1))),
        path.join(independent, stillName(row.frames.at(-1))));
      const temporal = row.name.endsWith('secondary') ? ['web', 'native'].map(renderer => {
        const output = renderer === 'web' ? path.join(golden, 'stills') : native;
        const psnr = measure(path.join(output, stillName(row.frames[0])), path.join(output, stillName(row.frames[1])));
        return { renderer, psnr, pass: Number.isFinite(psnr) && psnr < 40 };
      }) : [];
      results.push({ name: row.name, seekOrder: row.frames, expectedSceneDrops: [...expectedDrops], ...comparison,
        freshSeekIdentical: seekPsnr === Infinity, temporal,
        pass: comparison.pass && seekPsnr === Infinity && temporal.every(item => item.pass) });
    } catch (error) {
      results.push({ name: row.name, pass: false, error: String(error.stderr ?? error.message).slice(-6000) });
    }
  }
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify({ run, results }, null, 2));
  console.log(JSON.stringify({ run, results }, null, 2));
  return results.length > 0 && results.every(row => row.pass) ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
