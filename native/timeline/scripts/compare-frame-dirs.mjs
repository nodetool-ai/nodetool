#!/usr/bin/env node
// Compare matching relative PNG paths. Put the Windows failure subset first
// and the Linux reference tree second, or compare native/ with golden/.
// Usage: node compare-frame-dirs.mjs LEFT RIGHT NEW_DIFF_DIR
// PSNR is RGB (not the export gate's YUV metric). Diffs are absolute RGB x8.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { psnr, run } from '../src/export/check-export.mjs';

const [left, right, output] = process.argv.slice(2).map(p => path.resolve(p));
assert.ok(left && right && output, 'Usage: compare-frame-dirs.mjs LEFT RIGHT NEW_DIFF_DIR');
assert.ok(!fs.existsSync(output), `Choose a new difference directory: ${output}`);
function pngs(dir, relative = '') {
  return fs.readdirSync(path.join(dir, relative), { withFileTypes: true }).flatMap(entry => {
    const file = path.join(relative, entry.name);
    return entry.isDirectory() ? pngs(dir, file) : entry.name.endsWith('.png') ? [file] : [];
  }).sort();
}
const files = pngs(left);
assert.ok(files.length > 0, `No PNGs in ${left}`);
for (const file of files) {
  assert.ok(fs.existsSync(path.join(right, file)), `Missing counterpart: ${file}`);
}
for (const file of files) {
  const a = path.join(left, file);
  const b = path.join(right, file);
  const diff = path.join(output, file);
  fs.mkdirSync(path.dirname(diff), { recursive: true });
  const value = psnr(a, b);
  run('ffmpeg', ['-v', 'error', '-i', a, '-i', b, '-filter_complex',
    '[0:v]format=gbrp[a];[1:v]format=gbrp[b];[a][b]blend=all_mode=difference,lutrgb=r=val*8:g=val*8:b=val*8,format=rgb24',
    '-frames:v', '1', diff]);
  console.log(`${file}: RGB PSNR ${value.toFixed(6)} dB; absolute difference x8: ${diff}`);
}
console.log(`Compared ${files.length} frames`);
