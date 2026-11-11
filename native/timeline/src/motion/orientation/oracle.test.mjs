import test from 'node:test';
import assert from 'node:assert/strict';
import { orientationCases } from './oracle.mjs';
test('orientation cases distinguish untreated surfaces, effect stages, adjustments, nesting and blends', () => {
  const cases = orientationCases();
  assert.equal(cases.length, 7);
  assert.equal(cases[0].document.clips.find(clip => clip.id === 'group').effects, undefined);
  assert.equal(cases[0].document.clips.find(clip => clip.id === 'group').transitionIn.durationMs, 1);
  assert(cases[1].document.clips.find(clip => clip.id === 'group').effects[0].enabled);
  assert(cases[2].document.clips.some(clip => clip.mediaType === 'adjustment' && clip.parentId === 'group'));
  assert.equal(cases[3].document.clips.find(clip => clip.id === 'group').parentId, 'outer');
  assert.equal(cases[4].document.clips.find(clip => clip.id === 'group').blendMode, 'screen');
  assert.equal(cases[5].document.clips.find(clip => clip.id === 'group').transitionIn.type, 'wipe');
  assert(!cases[6].document.clips.some(clip => clip.mediaType === 'group'));
});
