import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExample, assertPreserved } from './oracle.mjs';

test('complete shipped documents retain all authored fields and resolve real media', () => {
  for (const slug of ['cadence', 'prism', 'voltra']) {
    const { original, document } = loadExample(slug);
    assertPreserved(original, document);
    assert(document.clips.length > 0);
    assert(document.clips.some(clip => clip.effects?.length));
    if (slug !== 'cadence') assert(document.clips.some(clip => clip.mediaPath));
  }
});
test('audit rejects removed treatments, missing clips and an empty document', () => {
  const { original, document } = loadExample('prism');
  const changed = structuredClone(document);
  delete changed.clips.find(clip => clip.effects?.length).effects;
  assert.throws(() => assertPreserved(original, changed));
  const wrongMedia = structuredClone(document);
  wrongMedia.clips.find(clip => clip.mediaPath).mediaPath = import.meta.filename;
  assert.throws(() => assertPreserved(original, wrongMedia));
  assert.throws(() => assertPreserved(original, { ...document, clips: document.clips.slice(1) }));
  assert.throws(() => assertPreserved({ clips: [] }, { clips: [] }));
});
