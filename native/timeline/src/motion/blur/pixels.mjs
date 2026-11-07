import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadExample, importGolden } from '../shipped/oracle.mjs';
import { assertImportedTreatments } from '../pixels/oracle.mjs';

const binary = path.resolve(process.argv[2]);
const hash = createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
const run = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'motion-blur-'));
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
fs.symlinkSync(path.join(repo, 'node_modules'), path.join(run, 'node_modules'), 'dir');
const { document } = loadExample('prism');
const shoe = document.clips.find((clip) => clip.id === 'shoe');
assert.equal(shoe.motionBlur.samplesPerFrame, 8);
const rendered = {};
for (const variant of ['blur', 'one', 'absent']) {
  const doc = structuredClone(document);
  const clip = doc.clips.find((item) => item.id === 'shoe');
  if (variant === 'one') clip.motionBlur.samplesPerFrame = 1;
  if (variant === 'absent') delete clip.motionBlur;
  const directory = path.join(run, variant); fs.mkdirSync(directory);
  const input = path.join(directory, 'input'); fs.mkdirSync(input);
  const file = path.join(input, 'prism.json');
  const before = JSON.stringify(doc); fs.writeFileSync(file, before);
  const native = path.join(directory, 'native');
  if (variant === 'blur') {
    const failed = spawnSync(binary, [file, '--stills', path.join(directory, 'failure'), '--still-frames', '173', '--decode', 'sw'],
      { timeout: 180000, encoding: 'utf8', env: { ...process.env, NT_TEST_FAIL_BLUR: '1' } });
    assert.equal(failed.signal, null, 'resource failure must not crash');
    assert.notEqual(failed.status, 0, 'resource failure must fail capture');
    assert.match(failed.stderr, /cannot allocate motion blur resources/);
  }
  execFileSync(binary, [file, '--stills', native, '--still-frames', '173', '--decode', 'sw'], { timeout: 180000, stdio: 'pipe' });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const nativePng = path.join(native, 'frame_000173.png');
  assert(fs.existsSync(nativePng));
  if (variant !== 'absent') {
    const web = path.join(directory, 'web');
    importGolden(file, [173], web, directory);
    assertImportedTreatments(doc, JSON.parse(fs.readFileSync(path.join(web, 'prism.imported.json'), 'utf8')));
    rendered[`${variant}Web`] = path.join(web, 'stills/frame_000173.png');
    assert(fs.existsSync(rendered[`${variant}Web`]));
  }
  rendered[`${variant}Native`] = nativePng;
}
assert.equal(createHash('sha256').update(fs.readFileSync(binary)).digest('hex'), hash);
const pixels = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
const a = pixels(rendered.blurWeb), b = pixels(rendered.oneWeb), c = pixels(rendered.blurNative), d = pixels(rendered.oneNative), e = pixels(rendered.absentNative);
assert(a.length > 0 && [b,c,d,e].every((p) => p.length === a.length));
assert.deepEqual(d, e, 'one sample must preserve the original frame');
let reference = 0, error = 0, nativeChange = 0;
for (let i = 0; i < a.length; i++) {
  const webDelta = a[i] - b[i], nativeDelta = c[i] - d[i];
  reference += webDelta * webDelta;
  nativeChange += nativeDelta * nativeDelta;
  error += (webDelta - nativeDelta) ** 2;
}
function checkDifference(referenceEnergy, nativeEnergy, residual) {
  assert(referenceEnergy > 0, 'web shutter toggle must change pixels');
  assert(nativeEnergy > 0, 'native shutter toggle must change pixels');
  assert(residual < referenceEnergy * 0.8, `native shutter difference must approach web: ${residual / referenceEnergy}`);
}
checkDifference(reference, nativeChange, error);
assert.throws(() => checkDifference(reference, 0, reference));
assert.throws(() => checkDifference(reference, nativeChange, reference));
assert.throws(() => checkDifference(0, nativeChange, error));
console.log(JSON.stringify({ run, hash, reference, nativeChange, errorRatio: error / reference }));
