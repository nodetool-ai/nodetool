import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadExample, assertPreserved, importGolden } from '../shipped/oracle.mjs';
import { assertImportedTreatments } from '../pixels/oracle.mjs';
import { comparePairs } from '../../render2d/check-example-stills.mjs';

export function prismCase(mode) {
  assert(['one-sample', 'original'].includes(mode));
  const { original, document } = loadExample('prism');
  const expected = structuredClone(original);
  if (mode === 'one-sample') {
    for (const value of [expected, document]) {
      const shoe = value.clips.find(clip => clip.id === 'shoe');
      assert.equal(shoe.motionBlur.samplesPerFrame, 8);
      shoe.motionBlur.samplesPerFrame = 1;
    }
  }
  assertPreserved(expected, document);
  return { expected, document };
}

export function main(argv) {
  assert(argv[0], 'native executable is required');
  const bin = path.resolve(argv[0]);
  const hash = () => createHash('sha256').update(fs.readFileSync(bin)).digest('hex');
  const binarySha256 = hash();
  const modes = argv.slice(1).length ? argv.slice(1) : ['one-sample', 'original'];
  for (const mode of modes) {
    assert(['one-sample', 'original'].includes(mode), 'unknown Prism comparison mode');
  }
  const run = fs.mkdtempSync(path.resolve(import.meta.dirname, '../../../build/motion-prism-'));
  const results = [];
  for (const mode of modes) {
    const result = { mode, pass: false };
    results.push(result);
    const directory = path.join(run, mode);
    fs.mkdirSync(directory);
    try {
      const { expected, document } = prismCase(mode);
      const total = Math.ceil(document.durationMs * document.fps / 1000);
      const frames = mode === 'one-sample' ? [173, 242] : Array.from({ length: 8 }, (_, i) => Math.floor((i + 0.5) * total / 8));
      Object.assign(result, { frames, clips: document.clips.length, media: document.clips.filter(clip => clip.mediaPath).length });
      const file = path.join(directory, 'prism.json');
      const before = JSON.stringify(document);
      fs.writeFileSync(file, before);
      const web = path.join(directory, 'web');
      importGolden(file, frames, web, directory);
      assertImportedTreatments(document, JSON.parse(fs.readFileSync(path.join(web, 'prism.imported.json'), 'utf8')));
      assert.equal(hash(), binarySha256, 'native executable changed before rendering');
      const native = path.join(directory, 'native');
      execFileSync(bin, [file, '--stills', native, '--still-frames', frames.join(','), '--decode', 'sw'], { stdio: 'pipe', timeout: 180000 });
      assert.equal(hash(), binarySha256, 'native executable changed during rendering');
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      assertPreserved(expected, document);
      Object.assign(result, comparePairs(frames, path.join(web, 'stills'), native, 40));
    } catch (error) {
      result.error = String(error.stderr ?? error.stack).slice(-6000);
      if (result.frames) {
        Object.assign(result, comparePairs(result.frames, path.join(directory, 'web/stills'), path.join(directory, 'native'), 40));
      }
      result.pass = false;
    }
  }
  const report = { binary: bin, binarySha256, run, results };
  fs.writeFileSync(path.join(run, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return results.length && results.every(result => result.pass) ? 0 : 1;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = main(process.argv.slice(2));
}
