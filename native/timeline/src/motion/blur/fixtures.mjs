import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cases, assertImportedTreatments } from '../pixels/oracle.mjs';
import { importGolden } from '../shipped/oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';

const binary = path.resolve(process.argv[2]);
const hash = createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
const run = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'motion-blur-fixtures-'));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(run, 'node_modules'), 'dir');
const selected = cases().filter((row) => ['nested-groups', 'repeated-secondary'].includes(row.name));
assert.equal(selected.length, 2);
for (const row of selected) {
  const document = structuredClone(row.document);
  const clip = row.name === 'repeated-secondary' ? document.clips.find((item) => item.id === 'picture')
    : document.clips.find((item) => item.parentId && item.mediaType !== 'group');
  assert(clip, `${row.name}: missing target clip`);
  clip.motionBlur = { samplesPerFrame: 4, shutterAngle: 270 };
  if (row.name === 'nested-groups') {
    const pinned = document.clips.find((item) => item.id === 'child-b');
    assert(pinned?.mediaType === 'video');
    pinned.durationMs = 710;
  }
  if (row.name === 'repeated-secondary') {
    assert(clip.repeater && clip.matte, 'repeated secondary matte is required');
    clip.steppedTime = { fps: 6 };
  }
  const directory = path.join(run, row.name); fs.mkdirSync(directory);
  const input = path.join(directory, 'input'); fs.mkdirSync(input);
  const file = path.join(input, `${row.name}.json`);
  const original = JSON.stringify(document); fs.writeFileSync(file, original);
  const web = path.join(directory, 'web');
  importGolden(file, [21, 0], web, directory);
  assertImportedTreatments(document, JSON.parse(fs.readFileSync(path.join(web, `${row.name}.imported.json`), 'utf8')));
  const native = path.join(directory, 'native');
  execFileSync(binary, [file, '--stills', native, '--still-frames', '21,0', '--decode', 'sw'], { timeout: 180000, stdio: 'pipe' });
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  const comparison = comparePairs([21, 0], path.join(web, 'stills'), native, 40);
  assert(comparison.pass, `${row.name}: ${JSON.stringify(comparison)}`);
  for (const frame of [21, 0]) {
    const fresh = path.join(directory, `fresh-${frame}`);
    execFileSync(binary, [file, '--stills', fresh, '--still-frames', String(frame), '--decode', 'sw'], { timeout: 180000, stdio: 'pipe' });
    const png = `frame_${String(frame).padStart(6, '0')}.png`;
    assert.deepEqual(fs.readFileSync(path.join(native, png)), fs.readFileSync(path.join(fresh, png)), `${row.name}: seek frame ${frame}`);
  }
}
assert.equal(createHash('sha256').update(fs.readFileSync(binary)).digest('hex'), hash);
console.log(JSON.stringify({ run, hash, cases: selected.map((row) => row.name) }));
