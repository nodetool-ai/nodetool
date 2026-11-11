import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { wipeCases } from '../wipe/oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';

export function orientationCases() {
  const base = structuredClone(wipeCases().find(row => row.name === 'group-transition').document);
  const leaf = base.clips[0];
  leaf.shapeStyle = { kind: 'rect', x: 0.12, y: 0.18, width: 0.61, height: 0.52, fill: '#f4a240' };
  leaf.transform = { position: { x: 12, y: -16 }, scale: { x: 0.6, y: 0.75 }, rotation: 0.25, anchor: { x: 0.5, y: 0.5 } };
  const group = base.clips.find(clip => clip.id === 'group');
  group.transform.rotation = -0.08;
  group.transitionIn = { type: 'crossfade', durationMs: 1 };
  const effect = structuredClone(base);
  effect.clips.find(clip => clip.id === 'group').effects = [{ id: 'vignette', type: 'vignette', enabled: true, amount: 0.2, softness: 0.6 }];
  const adjustment = structuredClone(base);
  delete adjustment.clips.find(clip => clip.id === 'group').transitionIn;
  adjustment.clips.push({ id: 'adjustment', name: 'Group treatment', trackId: 'leaf', parentId: 'group', mediaType: 'adjustment',
    startMs: 0, durationMs: 1000, sourceType: 'imported', status: 'generated', locked: false, versions: [],
    effects: [{ id: 'vignette', type: 'vignette', enabled: true, amount: 0.2, softness: 0.6 }] });
  const nested = structuredClone(base);
  nested.clips.find(clip => clip.id === 'group').parentId = 'outer';
  nested.clips.push({ ...structuredClone(group), id: 'outer', name: 'Outer surface', opacity: 0.8 });
  const blend = structuredClone(base);
  delete blend.clips.find(clip => clip.id === 'group').transitionIn;
  blend.clips.find(clip => clip.id === 'group').blendMode = 'screen';
  const wipe = structuredClone(base);
  wipe.clips.find(clip => clip.id === 'group').transitionIn = { type: 'wipe', durationMs: 1000, direction: 'down', softness: 0.12 };
  const treatment = structuredClone(adjustment);
  delete treatment.clips.find(clip => clip.id === 'adjustment').parentId;
  delete treatment.clips[0].parentId;
  treatment.clips = treatment.clips.filter(clip => clip.id !== 'group');
  return [{ name: 'no-effect-group', document: base }, { name: 'effect-group', document: effect },
    { name: 'adjusted-group', document: adjustment }, { name: 'nested-groups', document: nested },
    { name: 'blend-group', document: blend }, { name: 'wipe-group', document: wipe }, { name: 'adjustment-only', document: treatment }];
}
export function main(argv) {
  assert(argv[0], 'immutable native binary required');
  const binary = path.resolve(argv[0]);
  const backend = argv[1] ?? 'opengl';
  assert(['opengl', 'vulkan'].includes(backend));
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const binarySha256 = digest(binary);
  const captureEnvironment = { QT_QPA_PLATFORM: 'xcb', QSG_RHI_BACKEND: backend,
    QT_XCB_GL_INTEGRATION: process.env.QT_XCB_GL_INTEGRATION, LIBGL_ALWAYS_SOFTWARE: process.env.LIBGL_ALWAYS_SOFTWARE };
  const directory = fs.mkdtempSync(path.resolve(import.meta.dirname, '../../../build/motion-orientation-'));
  const sourceReport = argv[2] ? JSON.parse(fs.readFileSync(argv[2], 'utf8')) : null;
  const referenceDirectory = sourceReport?.referenceDirectory ?? sourceReport?.directory;
  const results = [];
  const cases = orientationCases();
  assert.equal(cases.length, 7);
  for (const row of cases) {
    const run = path.join(directory, row.name);
    fs.mkdirSync(run);
    const file = sourceReport ? path.join(referenceDirectory, row.name, 'input.json') : path.join(run, 'input.json');
    const web = sourceReport ? path.join(referenceDirectory, row.name, 'web') : path.join(run, 'web');
    if (!sourceReport) {
      fs.writeFileSync(file, JSON.stringify(row.document));
      fs.mkdirSync(web);
      const repo = path.resolve(import.meta.dirname, '../../../../..');
      const home = path.join(run, 'home');
      fs.mkdirSync(home);
      const stdout = execFileSync(process.execPath, [path.join(repo, 'node_modules/tsx/dist/cli.mjs'),
        path.join(repo, 'packages/cli/src/nodetool.ts'), 'timeline', 'render', file, '--stills', '--frames', '9',
        '--out', path.join(web, 'stills'), '--json'], { encoding: 'utf8', timeout: 240000,
        env: { ...process.env, HOME: home, DB_PATH: path.join(home, 'nodetool.sqlite3'), ASSET_FOLDER: path.join(home, 'assets') } });
      const summary = JSON.parse(stdout.slice(stdout.indexOf('{')));
      assert.deepEqual(summary.skippedClips, []);
      assert.deepEqual(summary.fontsUnavailable, []);
    }
    assert.deepEqual(JSON.parse(fs.readFileSync(file)), row.document);
    const fixtureSha256 = digest(file);
    const reference = path.join(web, 'stills/frame_000009.png');
    const referenceSha256 = digest(reference);
    assert.equal(digest(binary), binarySha256);
    const capture = spawnSync(binary, [file, '--stills', path.join(run, 'native'), '--still-frames', '9', '--decode', 'sw'],
      { encoding: 'utf8', timeout: 90000, env: { ...process.env, QT_QPA_PLATFORM: 'xcb', QSG_RHI_BACKEND: backend, QSG_INFO: '1' } });
    const nativeLog = `${capture.stdout ?? ''}${capture.stderr ?? ''}`;
    fs.writeFileSync(path.join(run, 'native.log'), nativeLog);
    assert.equal(capture.status, 0, capture.stderr ?? String(capture.error));
    assert(nativeLog.includes(`backend ${backend === 'opengl' ? 'OpenGL' : 'Vulkan'}`), 'actual QRhi backend must be logged');
    assert.equal(digest(binary), binarySha256);
    assert.equal(digest(file), fixtureSha256);
    assert.equal(digest(reference), referenceSha256);
    results.push({ name: row.name, fixtureSha256, referenceSha256, ...comparePairs([9], path.join(web, 'stills'), path.join(run, 'native'), 40) });
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ binary, binarySha256, backend, captureEnvironment, directory,
      referenceDirectory: referenceDirectory ?? directory, results }, null, 2));
  }
  console.log(JSON.stringify({ binary, binarySha256, backend, captureEnvironment, directory, results }, null, 2));
  return results.every(row => row.pass) ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = main(process.argv.slice(2));
