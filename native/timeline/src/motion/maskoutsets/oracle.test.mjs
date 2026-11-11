import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFixture, makeFixture, modes } from './fixture.mjs';

test('mask-outset fixtures retain their distinct cases and reject missing treatments', () => {
  let inspected = 0;
  for (const mode of modes) {
    const document = makeFixture(mode);
    assertFixture(document, mode);
    inspected++;
    const invalid = structuredClone(document);
    delete invalid.clips.find(clip => clip.id === 'S5_i10').mask;
    assert.throws(() => assertFixture(invalid, mode));
  }
  assert(inspected > 0);
});
