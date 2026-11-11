import assert from 'node:assert/strict';
import test from 'node:test';
import { makeFixture, assertFixture } from './fixture.mjs';

test('depth-of-field diagnostic retains a visible depth group and toggles only aperture', () => {
  const on = makeFixture(true);
  const off = makeFixture(false);
  assertFixture(on, true);
  assertFixture(off, false);
  const expected = structuredClone(on);
  expected.camera2d.aperturePx = 0;
  for (const key of expected.camera2d.keyframes) key.aperturePx = 0;
  assert.deepEqual(off, expected);
  const invalid = structuredClone(on);
  invalid.clips = [];
  assert.throws(() => assertFixture(invalid, true));
});
