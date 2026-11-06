import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acceptExpectedCapDrops, assertCoverage, assertImportedTreatments, cases } from './oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';

test('all complete pixel documents retain effects, crop, nesting and secondary sources', () => {
  const rows = cases();
  assertCoverage(rows);
  assert.throws(() => assertCoverage([]));
  const broken = structuredClone(rows);
  delete broken[2].document.clips.find(clip => clip.id === 'picture').matte;
  assert.throws(() => assertCoverage(broken));
});

test('missing rendered pairs cannot pass', () => {
  assert.equal(comparePairs([0], '/missing/web', '/missing/native', 40).pass, false);
  assert.equal(comparePairs([], '/missing/web', '/missing/native', 40).pass, false);
});

test('pixel comparator rejects a deliberately altered rendered image', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-pixel-contract-'));
  try {
    const web = path.join(directory, 'web');
    const native = path.join(directory, 'native');
    fs.mkdirSync(web);
    fs.mkdirSync(native);
    const source = path.join(directory, 'source.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=16x16', '-frames:v', '1', source]);
    const name = 'frame_000000.png';
    fs.copyFileSync(source, path.join(web, name));
    fs.copyFileSync(source, path.join(native, name));
    assert.equal(comparePairs([0], web, native, 40).pass, true);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-vf', 'negate', path.join(native, name)]);
    assert.equal(comparePairs([0], web, native, 40).pass, false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('only the exact expected video-cap skips may pass the import gate', () => {
  const failure = { status: 1, stderr: 'golden-import: FAIL: render skipped clips: c:repeat:8',
    stdout: JSON.stringify({ imported: 2, requestedFrames: 3, stills: 3, skippedClips: ['c:repeat:8'] }) };
  acceptExpectedCapDrops(failure, ['c:repeat:8'], 3);
  assert.throws(() => acceptExpectedCapDrops(failure, ['c:repeat:9'], 3));
  assert.throws(() => acceptExpectedCapDrops(failure, [], 3));
  assert.throws(() => acceptExpectedCapDrops({ ...failure, status: 2 }, ['c:repeat:8'], 3));
  assert.throws(() => acceptExpectedCapDrops({ ...failure, stdout: '{}' }, ['c:repeat:8'], 3));
});

test('asset import preserves complete ready matte treatments', () => {
  const original = cases()[4].document;
  const imported = structuredClone(original);
  imported.clips[0].currentAssetId = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  delete imported.clips[0].mediaPath;
  imported.clips[0].generatedMatte.assetId = 'cccccccccccccccccccccccccccccccc';
  delete imported.clips[0].generatedMatte.mediaPath;
  assertImportedTreatments(original, imported);
  imported.clips[0].generatedMatte.status = 'generating';
  assert.throws(() => assertImportedTreatments(original, imported));
  imported.clips[0].generatedMatte.status = 'ready';
  delete imported.clips[0].generatedMatte.featherPx;
  assert.throws(() => assertImportedTreatments(original, imported));
});
