import assert from 'node:assert/strict';
import { loadExample } from '../shipped/oracle.mjs';

export const modes = ['feather', 'hard', 'invert', 'crop', 'nested', 'full'];

export function makeFixture(mode) {
  assert(modes.includes(mode));
  const { document } = loadExample('voltra');
  const copy = document.clips.find(clip => clip.id === 'S5_i10');
  assert(copy?.mask && copy.effects?.some(effect => effect.type === 'glow'));
  if (mode !== 'full') delete copy.parentId;
  if (mode === 'hard') copy.mask.featherPx = 0;
  if (mode === 'invert') copy.mask.invert = true;
  if (mode === 'crop') {
    copy.crop = { left: 0.25, right: 0, top: 0, bottom: 0 };
    copy.mask = { kind: 'ellipse', x: 0.5, y: 0.2, width: 0.5, height: 0.3, featherPx: 40 };
  }
  if (mode === 'nested') {
    const outer = { id: 'outer', name: 'Outer', trackId: copy.trackId, mediaType: 'group', sourceType: 'imported', status: 'generated', locked: false, versions: [], startMs: copy.startMs, durationMs: copy.durationMs };
    const inner = { id: 'inner', name: 'Inner', trackId: copy.trackId, mediaType: 'group', sourceType: 'imported', status: 'generated', locked: false, versions: [], parentId: 'outer', startMs: copy.startMs, durationMs: copy.durationMs };
    copy.parentId = 'inner';
    document.clips = [outer, inner, copy];
  } else if (mode !== 'full') document.clips = [copy];
  assertFixture(document, mode);
  return document;
}

export function assertFixture(document, mode) {
  assert(document.clips.length > 0);
  const clip = document.clips.find(item => item.id === 'S5_i10');
  assert(clip?.mask && clip.effects?.some(effect => effect.type === 'glow' && effect.enabled));
  if (mode === 'hard') assert.equal(clip.mask.featherPx, 0);
  if (mode === 'feather') assert(clip.mask.featherPx > 0);
  if (mode === 'invert') assert.equal(clip.mask.invert, true);
  if (mode === 'crop') {
    assert.equal(clip.crop.left, 0.25);
    assert.equal(clip.crop.right, 0);
    assert.equal(clip.mask.x, 0.5);
    assert.equal(clip.mask.width, 0.5);
  }
  if (mode === 'nested') {
    assert.equal(clip.parentId, 'inner');
    assert(document.clips.some(item => item.id === 'inner' && item.parentId === 'outer'));
  }
}
