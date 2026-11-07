import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { goldenAudioSource, AUDIO_CONTENT_TYPES } from './golden-audio.mjs';
import { loadExample } from './oracle.mjs';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../../scripts/golden-import.mjs'), 'utf8');
function contentTypes(text) {
  const declaration = text.match(/const CONTENT_TYPES = (\{[^\n]+\});/);
  assert(declaration, 'must inspect the importer content-type declaration');
  return JSON.parse(declaration[1]);
}
test('complete shipped audio clips import their original WAV files', () => {
  const candidate = process.env.NT_GOLDEN_AUDIO_BASELINE === '1' ? source : goldenAudioSource(source);
  const types = contentTypes(candidate);
  let inspected = 0;
  for (const slug of ['t-minus-30', 'tidewater']) {
    const { document } = loadExample(slug);
    const score = document.clips.find(clip => clip.mediaType === 'audio');
    assert(score?.mediaPath && fs.existsSync(score.mediaPath));
    assert.equal(types[path.extname(score.mediaPath)], 'audio/wav');
    ++inspected;
  }
  assert.equal(inspected, 2);
});
test('guarded importer adjustment is exact, idempotent, and rejects declaration drift', () => {
  const candidate = goldenAudioSource(source);
  assert(candidate.includes(AUDIO_CONTENT_TYPES));
  assert.equal(goldenAudioSource(candidate), candidate);
  assert.deepEqual(contentTypes(candidate), { ...contentTypes(source), '.wav': 'audio/wav' });
  assert.throws(() => goldenAudioSource(source.replace('CONTENT_TYPES', 'CHANGED_TYPES')));
});
