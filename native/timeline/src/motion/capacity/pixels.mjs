import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const fixtures = path.join(root, 'src/preview/effects/fixtures');
const binaries = process.argv.slice(2, 4).map((item) => path.resolve(item));
assert.equal(binaries.length, 2, 'need baseline and scratch-reuse application binaries');
const hashes = binaries.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
const run = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), 'effect-scratch-pixels-'));
const home = path.join(run, 'home'); fs.mkdirSync(home);
const bytes = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
  { maxBuffer: 64 * 1024 * 1024 });
const assertSame = (a, b) => { assert(a.length > 0); assert.deepEqual(a, b); };
for (const name of ['clip-glow', 'clip-dropShadow', 'adjustment-group']) {
  const document = JSON.parse(fs.readFileSync(path.join(fixtures, `${name}.json`), 'utf8'));
  for (const clip of document.clips) {
    if (clip.mediaPath) clip.mediaPath = path.resolve(fixtures, clip.mediaPath);
    if (name !== 'adjustment-group') { clip.startMs = 0; clip.durationMs = 1000; }
  }
  document.durationMs = 1000;
  if (name === 'adjustment-group') {
    const adjustment = document.clips.find((clip) => clip.mediaType === 'adjustment');
    assert(adjustment?.parentId);
    adjustment.effects.push({ id: 'scratch-glow', type: 'glow', enabled: true, radius: 12, intensity: 0.8 });
    adjustment.effects.push({ id: 'scratch-shadow', type: 'dropShadow', enabled: true, radius: 8,
      offsetX: 9, offsetY: -4, color: '#224466', opacity: 0.6 });
  } else {
    const effects = document.clips.filter((clip) => clip.effects?.length).map((clip) => clip.effects[0]);
    assert.equal(effects.length, 2);
    const parameters = effects.map(({ id, ...rest }) => rest);
    assert.notDeepEqual(parameters[0], parameters[1], 'compare different effect parameters in one frame');
  }
  const directory = path.join(run, name); fs.mkdirSync(directory);
  const file = path.join(directory, `${name}.json`);
  const original = JSON.stringify(document); fs.writeFileSync(file, original);
  for (const [index, binary] of binaries.entries()) {
    const rendered = spawnSync(binary, [file, '--stills', path.join(directory, String(index)), '--still-frames', '21,0', '--decode', 'sw'],
      { timeout: 180000, encoding: 'utf8', env: { ...process.env, HOME: home, XDG_CACHE_HOME: path.join(home, 'cache'), QSG_INFO: '1' } });
    assert.equal(rendered.status, 0, rendered.stderr);
    const backend = process.env.QSG_RHI_BACKEND === 'opengl' ? 'OpenGL' : 'Vulkan';
    assert.match(rendered.stderr, new RegExp(`Creating QRhi with backend ${backend}`), 'must use the requested backend');
  }
  for (const frame of [21, 0]) {
    const png = `frame_${String(frame).padStart(6, '0')}.png`;
    const before = bytes(path.join(directory, '0', png)), after = bytes(path.join(directory, '1', png));
    assertSame(before, after);
    const mutation = Buffer.from(after); mutation[0] ^= 255;
    assert.throws(() => assertSame(before, mutation), 'comparison must reject changed pixels');
  }
  assert.equal(fs.readFileSync(file, 'utf8'), original);
}
for (let i = 0; i < binaries.length; i++) assert.equal(createHash('sha256').update(fs.readFileSync(binaries[i])).digest('hex'), hashes[i]);
console.log(JSON.stringify({ run, hashes, cases: ['clip-glow', 'clip-dropShadow', 'adjustment-group'] }));
