import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const bin = path.resolve(process.argv[2]);
const dir = fs.mkdtempSync(path.join(path.dirname(bin), 'picture-oracle-'));
try {
  const out = path.join(dir, 'web.mjs');
  await build({entryPoints: [path.join(root, 'packages/timeline/src/render/sceneModel.ts')],
    outfile: out, bundle: true, platform: 'node', format: 'esm'});
  const web = await import(pathToFileURL(out));
  const points = [{timeMs: 0, value: 1}, {timeMs: 1000, value: 0, easing: 'linear'}];
  const lane = (id, points, enabled) => ({id, target: {kind: 'clip', property: 'opacity'},
    points, ...(enabled === undefined ? {} : {enabled})});
  const times = [0, 125, 250, 500, 750, 999, 1000, 1250];
  const curves = ['linear', 'hold', 'easeInOut', 'cubic-bezier(0.2,0.7,0.8,0.4)']
    .map(easing => [easing, [points[0], {...points[1], easing}]]);
  curves.push(['single-point', [{timeMs: 0, value: 0}]]);
  let comparisons = 0;
  for (const type of ['video', 'overlay']) {
    for (const [curve, lanePoints] of curves) {
      for (const startMs of [0, 200]) {
        for (const active of [true, false]) {
          const doc = {name: 'Picture automation', fps: 30, width: 640, height: 360, durationMs: 1500,
            tracks: [{id: 'v', name: 'Picture', type, index: 0, visible: true, automation: [
              lane('disabled', [{timeMs: 0, value: 0}], false), lane('empty', []),
              ...(active ? [lane('active', lanePoints)] : [])
            ]}],
            clips: [{id: 'clip', trackId: 'v', name: 'Opaque', mediaType: 'video',
              status: 'generated', currentAssetId: 'opaque-source', startMs,
              durationMs: startMs === 0 ? 1100 : 600, inPointMs: 0, opacity: 1,
              animations: type === 'video' ? [] : [{id: 'authored', role: 'emphasis', preset: 'custom',
                durationMs: 1100, delayMs: 0, enabled: true, custom: {curves: [{property: 'opacity',
                  keyframes: [{t: 0, value: 0.5}, {t: 1, value: 0.5}]}]}}]}]};
          const file = path.join(dir, 'sequence.json');
          fs.writeFileSync(file, JSON.stringify(doc));
          const native = JSON.parse(execFileSync(bin, [file, '--dump-plan', '--times', times.join(',')],
            {encoding: 'utf8', env: {...process.env, QT_QPA_PLATFORM: 'offscreen'}}));
          const canvas = {width: doc.width, height: doc.height, fps: doc.fps};
          for (const [i, time] of times.entries()) {
            const scene = web.computeActiveLayersWithHorizon(doc.tracks, doc.clips, time, {canvas});
            assert.equal(native.frames[i].layers.length, scene.layers.length);
            for (const [j, layer] of scene.layers.entries()) {
              const expected = web.resolveAnimatedLayerProps(layer, time, canvas).opacity;
              const actual = native.frames[i].layers[j].drawOpacity;
              assert(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-6,
                `${type} ${curve} start=${startMs} active=${active} t=${time}: native=${actual} web=${expected}`);
              comparisons++;
            }
          }
          assert(!(native.planUnsupportedFields?.clip ?? []).includes('track.automation'),
            'Picture automation must not be excluded from plan conformance');
        }
      }
    }
  }
  assert(comparisons > 0);
  console.log(`PASS ${comparisons} picture automation drawOpacity comparisons against web sceneModel.ts`);
} finally {
  fs.rmSync(dir, {recursive: true, force: true});
}
