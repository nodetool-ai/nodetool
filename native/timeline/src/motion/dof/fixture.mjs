import assert from 'node:assert/strict';
import { loadExample } from '../shipped/oracle.mjs';

export function makeFixture(apertureEnabled, full = false) {
  const { document } = loadExample('serein');
  const ids = new Set(['S1_g147']);
  let added = true;
  while (added) {
    added = false;
    for (const clip of document.clips) {
      if (ids.has(clip.parentId) && !ids.has(clip.id)) {
        ids.add(clip.id);
        added = true;
      }
    }
  }
  ids.add('S1_g145'); ids.add('S1_g4'); ids.add('S1');
  if (!full) document.clips = document.clips.filter(clip => ids.has(clip.id));
  assertFixture(document, apertureEnabled);
  if (!apertureEnabled) {
    document.camera2d.aperturePx = 0;
    for (const key of document.camera2d.keyframes ?? []) key.aperturePx = 0;
  }
  return document;
}

export function assertFixture(document, requireAperture) {
  assert(document.clips.length > 3);
  const group = document.clips.find(clip => clip.id === 'S1_g147');
  assert.equal(group?.transform?.depthPx, 220);
  assert(document.clips.some(clip => clip.parentId === group.id && clip.mediaType === 'shape'));
  if (requireAperture) assert(document.camera2d.keyframes.some(key => key.aperturePx > 0));
}
