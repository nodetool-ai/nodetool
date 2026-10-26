import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [root, editor, binary] = process.argv.slice(2);
const fixture = path.join(root, 'fixtures/audio-mix.json');
const source = JSON.parse(fs.readFileSync(fixture, 'utf8'));
for (const clip of source.clips) {
  for (const field of ['mediaPath', 'audioPath']) {
    if (clip[field]) clip[field] = path.resolve(path.dirname(fixture), clip[field]);
  }
}
const shapes = ['linear', 'sCurve', 'plus3dB', 'minus3dB'];
const requests = shapes.map(shape => ({
  document: source,
  edits: Object.entries({ volumeDb: -7.5, fadeInMs: 321, fadeOutMs: 777, fadeInShape: shape, fadeOutShape: shape })
    .map(([field, value]) => ({ name: 'setClipAudio', payload: { clipId: 'a', field, value } })),
  fullDocument: true
}));
const documents = JSON.parse(execFileSync(editor, ['--json'], {
  input: JSON.stringify(requests), encoding: 'utf8',
  env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
}));
assert.equal(documents.length, shapes.length, 'must check every fade curve');
const files = [];
for (const [i, document] of documents.entries()) {
  assert.notDeepEqual(document, source, 'audio edits must change the fixture');
  const clip = document.clips.find(c => c.id === 'a');
  assert.equal(clip.volumeDb, -7.5);
  assert.equal(clip.fadeInMs, 321);
  assert.equal(clip.fadeOutMs, 777);
  assert.equal(clip.fadeInShape, shapes[i]);
  assert.equal(clip.fadeOutShape, shapes[i]);
  const file = path.join(root, 'fixtures/generated', `clip-audio-${shapes[i]}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(document));
  files.push(file);
}
assert.ok(files.length > 0);
execFileSync(process.execPath, [path.join(root, 'scripts/check-mix.mjs'), ...files, '--bin', binary], {
  stdio: 'inherit', env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
});
