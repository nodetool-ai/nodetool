import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

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
const effectSource = structuredClone(source);
effectSource.clips = [{ ...source.clips.find(c => c.id === 'b'), id: 'a', startMs: 0,
  durationMs: 1000, fadeInMs: 0, fadeOutMs: 0 }];
effectSource.durationMs = 1500;
effectSource.master.volumeDb = 0;
requests.push({ document: effectSource, fullDocument: true, edits: [
  { name: 'addClipAudioEffect', payload: { clipId: 'a', type: 'gain', id: 'gain' } },
  { name: 'addClipAudioEffect', payload: { clipId: 'a', type: 'filter', id: 'filter' } },
  { name: 'addClipAudioEffect', payload: { clipId: 'a', type: 'echo', id: 'echo' } },
  { name: 'patchClipAudioEffect', payload: { clipId: 'a', effectId: 'gain', patch: { gainDb: -6 } } },
  { name: 'patchClipAudioEffect', payload: { clipId: 'a', effectId: 'filter', patch: { mode: 'highpass', frequency: 200 } } },
  { name: 'patchClipAudioEffect', payload: { clipId: 'a', effectId: 'echo', patch: { enabled: false } } },
  { name: 'moveClipAudioEffect', payload: { clipId: 'a', effectId: 'filter', delta: -1 } },
  { name: 'removeClipAudioEffect', payload: { clipId: 'a', effectId: 'echo' } }
] });
const work = fs.mkdtempSync(path.join(tmpdir(), 'clip-audio-mix-'));
const inputFile = path.join(work, 'input.json');
fs.writeFileSync(inputFile, JSON.stringify(requests));
const input = fs.openSync(inputFile, 'r');
let documents;
try {
  documents = JSON.parse(execFileSync(editor, ['--json'], {
    stdio: [input, 'pipe', 'pipe'], encoding: 'utf8', timeout: 30000,
    env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
  }));
} finally {
  fs.closeSync(input);
  fs.rmSync(work, { recursive: true, force: true });
}
assert.equal(documents.length, shapes.length + 1, 'must check every fade curve and the edited effects chain');
assert.deepEqual(documents.at(-1).clips.find(c => c.id === 'a').audioEffects, [
  { id: 'filter', type: 'filter', enabled: true, mode: 'highpass', frequency: 200, q: 1 },
  { id: 'gain', type: 'gain', enabled: true, gainDb: -6 }
]);
const files = [];
for (const [i, document] of documents.entries()) {
  assert.notDeepEqual(document, i < shapes.length ? source : effectSource, 'audio edits must change the fixture');
  const clip = document.clips.find(c => c.id === 'a');
  if (i < shapes.length) {
    assert.equal(clip.volumeDb, -7.5);
    assert.equal(clip.fadeInMs, 321);
    assert.equal(clip.fadeOutMs, 777);
    assert.equal(clip.fadeInShape, shapes[i]);
    assert.equal(clip.fadeOutShape, shapes[i]);
  }
  const file = path.join(root, 'fixtures/generated', `clip-audio-${shapes[i] ?? "effects"}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(document));
  files.push(file);
}
assert.ok(files.length > 0);
execFileSync(process.execPath, [path.join(root, 'scripts/check-mix.mjs'), ...files.slice(0, shapes.length), '--bin', binary], {
  stdio: 'inherit', env: { ...process.env, QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' }
});

execFileSync(process.execPath, [path.join(root, 'src/edit/clipaudio/check_effects_mix.mjs'), root, files.at(-1), binary], {
  stdio: 'inherit', env: { ...process.env, QT_QPA_PLATFORM: 'offscreen' }
});
