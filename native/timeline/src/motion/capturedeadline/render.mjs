import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadExample } from '../shipped/oracle.mjs';
import { measure } from '../../render2d/check-example-stills.mjs';

const [capture, app] = process.argv.slice(2).map(value => path.resolve(value));
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-capture-'));
try {
  const { document } = loadExample('serein');
  assert(document.clips.length > 0);
  const file = path.join(directory, 'serein.json');
  const contents = JSON.stringify(document);
  fs.writeFileSync(file, contents);
  const preview = path.join(directory, 'preview');
  const exported = path.join(directory, 'export.png');
  execFileSync(app, [file, '--stills', preview, '--still-frames', '48', '--decode', 'sw'], { stdio: 'pipe', timeout: 120000 });
  execFileSync(capture, [file, exported], { stdio: 'pipe', timeout: 120000 });
  assert.equal(fs.readFileSync(file, 'utf8'), contents);
  assert.equal(measure(path.join(preview, 'frame_000048.png'), exported), Infinity, 'export and still pixels differ');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
