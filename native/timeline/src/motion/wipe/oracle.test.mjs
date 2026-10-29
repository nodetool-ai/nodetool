import test from 'node:test';
import assert from 'node:assert/strict';
import { wipeCases } from './oracle.mjs';
test('wipe oracle retains every directional, grouped, cropped and treated case', () => {
  const cases = wipeCases();
  assert.equal(cases.length, 14);
  assert.deepEqual(new Set(cases.slice(0, 8).map(row => row.document.clips[0].animations[0].custom.mask.direction)), new Set(['left', 'right', 'up', 'down']));
  for (const { document } of cases.filter(row => row.name !== 'group-transition')) {
    assert(document.clips[0].animations[0].custom.curves.some(curve => curve.property === 'wipeProgress'));
    assert(document.clips.some(clip => clip.id === 'background'));
  }
  assert(cases[8].document.clips[0].parentId);
  assert(cases[9].document.clips[0].crop);
  assert.equal(cases[9].document.clips[0].effects[0].type, 'blur');
  assert.equal(cases[9].document.clips[0].blendMode, 'screen');
  assert.equal(cases[10].document.clips.find(clip => clip.id === 'group').transitionIn.type, 'wipe');
  assert(cases[11].document.clips[0].transitionIn && cases[11].document.clips[0].animations);
  assert.equal(cases[12].document.clips[0].matte.mode, 'alpha');
});
