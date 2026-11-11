import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertCoverage, assertFrameNames, cases, compareExportFrames } from './oracle.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('border fixtures fail closed when a required feature is missing', () => {
  const rows = cases();
  assertCoverage(rows);
  assert.throws(() => assertCoverage([]));
  const noTrailingDuration = structuredClone(rows);
  noTrailingDuration[0].document.durationMs = 1000;
  assert.throws(() => assertCoverage(noTrailingDuration));
  for (const remove of [
    clip => { delete clip.borderRadius; },
    clip => { delete clip.animations; },
    clip => { if (clip.transform) clip.transform.rotation = 0; },
    clip => { delete clip.blendMode; }
  ]) {
    const broken = structuredClone(rows);
    for (const row of broken) for (const clip of row.document.clips) remove(clip);
    assert.throws(() => assertCoverage(broken));
  }
});


test('export comparison rejects empty, missing and changed frames', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'border-export-contract-'));
  try {
    const stills = path.join(dir, 'stills'), exported = path.join(dir, 'export');
    fs.mkdirSync(stills);
    fs.mkdirSync(exported);
    const still = path.join(stills, 'frame_000000.png');
    const png = path.join(exported, 'frame_000001.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=16x16', '-frames:v', '1', still]);
    assert.throws(() => compareExportFrames([], stills, exported));
    assert.equal(compareExportFrames([0], stills, exported), false);
    fs.copyFileSync(still, png);
    assert.equal(compareExportFrames([0], stills, exported), true);
    assertFrameNames(['frame_000001.png', 'frame_000002.png'], 2);
    assert.throws(() => assertFrameNames(['frame_000001.png'], 2));
    assert.throws(() => assertFrameNames(['frame_000002.png', 'frame_000001.png'], 2));
    assert.throws(() => assertFrameNames(['frame_000001.png', 'frame_000001.png'], 2));
    assert.throws(() => assertFrameNames([], 0));
    fs.rmSync(png);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', still, '-vf', 'negate', png]);
    assert.equal(compareExportFrames([0], stills, exported), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
