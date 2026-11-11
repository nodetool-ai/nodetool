// Complete synthetic documents through the production web and native exporters.
import assert from 'node:assert/strict';
import { computeActiveLayersWithHorizon } from '@nodetool-ai/timeline/scene';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { matteImports, prepareMatteFixture } from '../../preview/effects/import-matte.mjs';
import { comparePairs, measure } from '../../render2d/check-example-stills.mjs';
import { acceptExpectedCapDrops, assertImportedTreatments } from '../pixels/oracle.mjs';
import { importGolden } from '../shipped/oracle.mjs';

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
  nested.durationMs = 2000;
  const crop = document('clip-crop-chain');
  const repeated = document('matte-moving');
  const picture = repeated.clips.find(clip => clip.id === 'picture');
  picture.repeater = { count: 3, positionStep: { x: 190, y: 0 }, timeStepMs: 100,
    colorStep: { hueDegrees: 24, brightness: 0.04 } };
  picture.transform = { position: { x: -190, y: 0 }, scale: { x: 0.35, y: 0.55 }, rotation: 0,
    anchor: { x: 0.5, y: 0.5 } };
  picture.crop = { left: 0.125, right: 0.125, top: 0.125, bottom: 0.125 };
  picture.effects = [{ id: 'blur', type: 'blur', enabled: true, radius: 8 }];
  for (const clip of crop.clips) { if (clip.mediaPath) clip.borderRadius = 180; }
  picture.borderRadius = 180;
  picture.transform.rotation = 0.24;
  picture.animations = [{ id: 'radius', preset: 'custom', role: 'emphasis', durationMs: 1000,
    styleTracks: [{ target: 'clip.borderRadius', keyframes: [
      { t: 0, value: 30 }, { t: 1, value: 180 }
    ] }] }];
  for (const clip of nested.clips) { if (clip.mediaPath) clip.borderRadius = 180; }
  nested.clips.find(clip => clip.id === 'child-b').blendMode = 'screen';
  const outset = structuredClone(crop);
  outset.id = 'seq-radius-outset';
  outset.clips[0].animations = structuredClone(picture.animations);
  outset.clips[0].effects.push({ id: 'shadow', type: 'dropShadow', enabled: true,
    offsetX: 25, offsetY: 18, blur: 8, color: '#102060', opacity: 0.8 });
  const generated = document('generated-matte');
  generated.clips[0].borderRadius = 180;
  Object.assign(generated.clips[0], structuredClone({ repeater: picture.repeater, transform: picture.transform,
    crop: picture.crop, effects: picture.effects }));
  return [
    { name: 'nested-groups', document: nested, frames: [45, 0, 21, 15] },
    { name: 'crop-effects', document: crop, frames: [21, 0, 15] },
    { name: 'crop-outset', document: outset, frames: [21, 0, 15] },
    { name: 'repeated-secondary', document: repeated, frames: [42, 0, 21] },
    { name: 'repeated-generated-secondary', document: generated, frames: [42, 0, 21] }
  ];
}
export function assertCoverage(rows) {
  assert.equal(rows.length, 5, 'must inspect every motion pixel fixture');
  assert(rows.every(row => row.document.clips.some(clip => clip.borderRadius > 0)), 'every fixture must exercise border radius');
  const animated = rows.flatMap(row => row.document.clips).filter(clip => clip.animations?.some(animation =>
    animation.styleTracks?.some(track => track.target === 'clip.borderRadius' && track.keyframes.length > 1)));
  assert(animated.length > 0, 'inspect animated border radius');
  assert(rows.some(row => row.document.clips.some(clip => clip.borderRadius > 0 && clip.transform?.rotation)), 'inspect rotated radius');
  assert(rows.some(row => row.document.clips.some(clip => clip.borderRadius > 0 && clip.blendMode && clip.blendMode !== 'normal')), 'inspect non-normal blend');
  const [nested, crop, outset, repeated, generated] = rows.map(row => row.document);
  assert(nested.durationMs > Math.max(...nested.clips.map(clip => clip.startMs + clip.durationMs)), 'inspect the authored duration beyond the last clip');
  assert(rows[0].frames.some(frame => frame * 1000 / nested.fps >= Math.max(...nested.clips.map(clip => clip.startMs + clip.durationMs))), 'inspect a frame after the last clip');
  assert.equal(nested.clips.filter(clip => clip.mediaType === 'group').length, 2);
  assert(nested.clips.some(clip => clip.parentId === 'inner'));
  assert(crop.clips.some(clip => clip.crop && clip.effects.length > 1));
  assert(outset.clips.some(clip => clip.borderRadius > 0 && clip.crop && clip.effects.some(effect => effect.type === 'dropShadow' && effect.enabled)), 'inspect an effect outset');
  assert(repeated.clips.some(clip => clip.matte && clip.repeater?.count === 3 && clip.crop && clip.effects.length));
  assert(generated.clips.some(clip => clip.generatedMatte?.status === 'ready' && clip.repeater?.count === 3));
  for (const row of rows) {
    assert(row.frames[0] > row.frames[1], 'exercise backward seek order');
    assert(row.document.clips.some(clip => clip.mediaPath), 'inspect real local sources');
  }
}
export function assertFrameNames(names, count) {
  assert(Number.isInteger(count) && count > 0, 'require a positive frame count');
  const expected = Array.from({ length: count }, (_, index) => `frame_${String(index + 1).padStart(6, '0')}.png`);
  assert.deepEqual(names, expected, 'export must contain the complete authored window');
}

export function compareExportFrames(frames, stills, exported) {
  assert(frames.length > 0, 'inspect at least one exported frame');
  return frames.every(frame => {
    const still = path.join(stills, `frame_${String(frame).padStart(6, '0')}.png`);
    const png = path.join(exported, `frame_${String(frame + 1).padStart(6, '0')}.png`);
    return fs.existsSync(still) && fs.existsSync(png) && measure(still, png) === Infinity;
  });
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
        importGolden(importFixture, row.frames, golden, directory);
        assert.equal(expectedDrops.size, 0, 'the exporter must report expected capped copies');
      } catch (error) {
        acceptExpectedCapDrops(error, [...expectedDrops], row.frames.length);
      }
      if (mattes.length) {
        fs.rmSync(path.join(golden, 'stills'), { recursive: true, force: true });
        execFileSync(process.execPath, [path.join(root, 'src/preview/effects/import-matte.mjs'), fixture,
          path.join(golden, `${row.name}.imported.json`), row.frames.join(','), path.join(golden, 'stills'),
          path.resolve(root, '../..'), path.join(directory, 'store')], { stdio: 'pipe', timeout: 240000 });
      }
      assertImportedTreatments(row.document, JSON.parse(fs.readFileSync(path.join(golden, `${row.name}.imported.json`), 'utf8')));
      execFileSync(bin, [fixture, '--stills', native, '--still-frames', row.frames.join(','), '--decode', 'sw'],
        { stdio: 'pipe', timeout: 120000 });
      assert.equal(fs.readFileSync(fixture, 'utf8'), before, 'render must preserve complete fixture');
      const archive = path.join(directory, 'export.zip');
      const summary = JSON.parse(execFileSync(bin, [fixture, '--export', archive, '--format', 'png_sequence', '--json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 }));
      assert.equal(summary.format, 'png_sequence');
      const duration = row.document.durationMs > 0 ? row.document.durationMs : Math.max(0, ...row.document.clips.map(clip => clip.startMs + clip.durationMs));
      assert.equal(summary.frames, Math.max(1, Math.round(duration * row.document.fps / 1000)));
      const exported = path.join(directory, 'export');
      fs.mkdirSync(exported);
      execFileSync('unzip', ['-qq', archive, '-d', exported], { timeout: 30000 });
      const names = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n').filter(name => name.endsWith('.png'));
      assertFrameNames(names, summary.frames);
      const exportMatchesStills = compareExportFrames(row.frames, native, exported);
      const comparison = comparePairs(row.frames, path.join(golden, 'stills'), native, 40);
      const stillName = frame => `frame_${String(frame).padStart(6, '0')}.png`;
      const independent = path.join(directory, 'native-fresh');
      execFileSync(bin, [fixture, '--stills', independent, '--still-frames', String(row.frames.at(-1)), '--decode', 'sw'],
        { stdio: 'pipe', timeout: 120000 });
      const seekPsnr = measure(path.join(native, stillName(row.frames.at(-1))),
        path.join(independent, stillName(row.frames.at(-1))));
      const temporal = (row.name.endsWith('secondary') || row.name === 'crop-outset') ? ['web', 'native'].map(renderer => {
        const output = renderer === 'web' ? path.join(golden, 'stills') : native;
        const psnr = measure(path.join(output, stillName(row.frames[0])), path.join(output, stillName(row.frames[1])));
        return { renderer, psnr, pass: Number.isFinite(psnr) && psnr < 40 };
      }) : [];
      results.push({ name: row.name, seekOrder: row.frames, expectedSceneDrops: [...expectedDrops], ...comparison,
        freshSeekIdentical: seekPsnr === Infinity, exportMatchesStills, temporal,
        pass: comparison.pass && seekPsnr === Infinity && exportMatchesStills && temporal.every(item => item.pass) });
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
