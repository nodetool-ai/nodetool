import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { importGolden } from '../shipped/oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';

const captureEnvironment = { QT_QPA_PLATFORM: 'xcb', QSG_RHI_BACKEND: 'vulkan' };

export function wipeCases() {
  const common = { name: 'Wipe fixture', startMs: 0, durationMs: 1000, sourceType: 'imported', status: 'generated', locked: false, versions: [] };
  const animation = (direction, softness) => [{ id: 'reveal', role: 'in', preset: 'custom', durationMs: 1000,
    custom: { curves: [{ property: 'wipeProgress', keyframes: [{ t: 0, value: 0 }, { t: 1, value: 1 }] }], mask: { direction, softness } } }];
  const base = {
    id: 'animated-wipe', projectId: 'fixtures', name: 'Source-space animated wipe', fps: 30, width: 320, height: 180, durationMs: 1000,
    createdAt: '1970-01-01T00:00:00.000Z', updatedAt: '1970-01-01T00:00:00.000Z', markers: [],
    tracks: [{ id: 'leaf', name: 'Leaf', type: 'video', index: 0, visible: true, locked: false }, { id: 'back', name: 'Background', type: 'video', index: 1, visible: true, locked: false }],
    clips: [{ ...common, id: 'leaf', trackId: 'leaf', mediaType: 'shape',
      shapeStyle: { kind: 'rect', x: 0.1, y: 0.1, width: 0.8, height: 0.8, fill: '#f4a240' },
      animations: animation('left', 0) },
    { ...common, id: 'background', trackId: 'back', mediaType: 'shape', shapeStyle: { kind: 'rect', x: 0, y: 0, width: 1, height: 1, fill: '#203040' } }]
  };
  const cases = [];
  for (const direction of ['left', 'right', 'up', 'down']) {
    for (const softness of [0, 0.12]) {
      const document = structuredClone(base);
      document.clips[0].animations = animation(direction, softness);
      cases.push({ name: `${direction}-${softness === 0 ? 'hard' : 'soft'}`, document });
    }
  }
  const grouped = structuredClone(base);
  grouped.clips[0].parentId = 'group';
  grouped.clips[0].animations = animation('left', 0.12);
  grouped.clips[0].transform = { position: { x: 12, y: -4 }, scale: { x: 0.72, y: 0.72 }, rotation: 17, anchor: { x: 0.5, y: 0.5 } };
  grouped.clips.push({ ...common, id: 'group', trackId: 'leaf', mediaType: 'group', opacity: 0.7,
    transform: { position: { x: -8, y: 4 }, scale: { x: 0.9, y: 0.9 }, rotation: -8, anchor: { x: 0.5, y: 0.5 } } });
  cases.push({ name: 'nested-transform', document: grouped });
  const image = structuredClone(base);
  Object.assign(image.clips[0], { mediaType: 'image', width: 64, height: 64,
    currentAssetId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', mediaPath: path.resolve(import.meta.dirname, '../prism/fixtures/chroma-444.jpg'),
    animations: animation('up', 0.12), crop: { left: 0.125, right: 0.125, top: 0.125, bottom: 0.125 },
    effects: [{ id: 'blur', type: 'blur', enabled: true, radius: 3 }], blendMode: 'screen' });
  delete image.clips[0].shapeStyle;
  cases.push({ name: 'cropped-blurred-image', document: image });
  const groupCut = structuredClone(grouped);
  delete groupCut.clips[0].animations;
  groupCut.clips.find(clip => clip.id === 'group').transitionIn = { type: 'wipe', durationMs: 1000, direction: 'down', softness: 0.12 };
  cases.push({ name: 'group-transition', document: groupCut });
  const ownWins = structuredClone(base);
  ownWins.clips[0].transitionIn = { type: 'wipe', durationMs: 1000, direction: 'right', softness: 0 };
  cases.push({ name: 'own-mask-wins-transition', document: ownWins });
  const matted = structuredClone(image);
  matted.clips[0].matte = { mode: 'alpha', sourceClipId: 'matte' };
  matted.clips.push({ ...common, id: 'matte', trackId: 'leaf', mediaType: 'shape',
    shapeStyle: { kind: 'rect', x: 0.2, y: 0.1, width: 0.6, height: 0.8, fill: '#ffffff' } });
  cases.push({ name: 'cropped-treated-matte', document: matted });
  const hardTransformed = structuredClone(grouped);
  hardTransformed.clips[0].animations = animation('left', 0);
  hardTransformed.clips[0].transform.position.x += 0.3;
  cases.push({ name: 'fractional-hard-transform', document: hardTransformed });
  return cases;
}
export function replay(argv) {
  assert(argv.length >= 3 && argv[1] === '--replay', 'binary --replay report.json... required');
  const binary = path.resolve(argv[0]);
  const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const binarySha256 = digest(binary);
  const directory = fs.mkdtempSync(path.resolve(import.meta.dirname, '../../../build/motion-wipe-replay-'));
  const results = [];
  const inspected = new Set();
  for (const sourceReport of argv.slice(2).map(file => path.resolve(file))) {
    const sourceReportSha256 = digest(sourceReport);
    const source = JSON.parse(fs.readFileSync(sourceReport, 'utf8'));
    assert(source.results.length > 0, 'reference report must contain inspected cases');
    for (const row of source.results) {
      assert(!inspected.has(row.name), `duplicate reference case ${row.name}`);
      inspected.add(row.name);
      const fixture = path.join(path.resolve(source.directory), row.name, 'wipe.json');
      const fixtureSha256 = digest(fixture);
      const web = path.join(path.resolve(source.directory), row.name, 'web/stills');
      const reference = path.join(web, 'frame_000009.png');
      const referenceSha256 = digest(reference);
      const native = path.join(directory, row.name);
      assert.equal(digest(binary), binarySha256);
      execFileSync(binary, [fixture, '--stills', native, '--still-frames', '9', '--decode', 'sw'], { stdio: 'pipe', timeout: 90000, env: { ...process.env, ...captureEnvironment } });
      assert.equal(digest(binary), binarySha256);
      assert.equal(digest(fixture), fixtureSha256);
      assert.equal(digest(reference), referenceSha256);
      assert.equal(digest(sourceReport), sourceReportSha256);
      results.push({ name: row.name, sourceReport, sourceReportSha256, fixture, fixtureSha256, web, referenceSha256,
        ...comparePairs([9], web, native, 40) });
      fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ binary, binarySha256, captureEnvironment, directory, results }, null, 2));
    }
  }
  assert.equal(inspected.size, 14, 'replay must cover every retained wipe case');
  console.log(JSON.stringify({ binary, binarySha256, captureEnvironment, directory, results }, null, 2));
  return results.every(row => row.pass) ? 0 : 1;
}
export function main(argv) {
  assert(argv[0], 'immutable native binary required');
  const binary = path.resolve(argv[0]);
  const hash = () => createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  const binarySha256 = hash();
  const directory = fs.mkdtempSync(path.resolve(import.meta.dirname, '../../../build/motion-wipe-'));
  const results = [];
  const allCases = wipeCases();
  assert.equal(allCases.length, 14);
  const cases = argv.length > 1 ? allCases.filter(row => argv.slice(1).includes(row.name)) : allCases;
  assert(cases.length > 0);
  if (argv.length > 1) { assert.equal(cases.length, new Set(argv.slice(1)).size, 'unknown wipe case'); }
  for (const row of cases) {
    const run = path.join(directory, row.name);
    fs.mkdirSync(run);
    const file = path.join(run, 'wipe.json');
    const before = JSON.stringify(row.document);
    fs.writeFileSync(file, before);
    if (row.document.clips.some(clip => clip.mediaPath)) {
      importGolden(file, [9], path.join(run, 'web'), run);
    } else {
      const repo = path.resolve(import.meta.dirname, '../../../../..');
      const home = path.join(run, 'home');
      fs.mkdirSync(home);
      fs.mkdirSync(path.join(run, 'web'));
      const stdout = execFileSync(process.execPath, [path.join(repo, 'node_modules/tsx/dist/cli.mjs'),
        path.join(repo, 'packages/cli/src/nodetool.ts'), 'timeline', 'render', file, '--stills', '--frames', '9',
        '--out', path.join(run, 'web/stills'), '--json'], { encoding: 'utf8', timeout: 240000,
        env: { ...process.env, HOME: home, DB_PATH: path.join(home, 'nodetool.sqlite3'), ASSET_FOLDER: path.join(home, 'assets') } });
      const summary = JSON.parse(stdout.slice(stdout.indexOf('{')));
      assert.deepEqual(summary.skippedClips, []);
      assert.deepEqual(summary.fontsUnavailable, []);
    }
    assert.equal(hash(), binarySha256);
    execFileSync(binary, [file, '--stills', path.join(run, 'native'), '--still-frames', '9', '--decode', 'sw'], { stdio: 'pipe', timeout: 90000, env: { ...process.env, ...captureEnvironment } });
    assert.equal(hash(), binarySha256);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    results.push({ name: row.name, ...comparePairs([9], path.join(run, 'web/stills'), path.join(run, 'native'), 40) });
    fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ binary, binarySha256, captureEnvironment, directory,
      requestedCases: cases.map(item => item.name), results }, null, 2));
  }
  const report = { binary, binarySha256, captureEnvironment, directory, results };
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return results.every(row => row.pass) ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = process.argv[3] === '--replay' ? replay(process.argv.slice(2)) : main(process.argv.slice(2));
