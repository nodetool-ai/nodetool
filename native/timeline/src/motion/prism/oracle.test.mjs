import test from 'node:test';
import assert from 'node:assert/strict';
import { prismCase } from './oracle.mjs';
import { loadExample } from '../shipped/oracle.mjs';

test('decoder diagnostic changes only shoe sample count and retains original JPEG sources', () => {
  const { document } = prismCase('one-sample');
  const { document: original } = loadExample('prism');
  document.clips.find(clip => clip.id === 'shoe').motionBlur.samplesPerFrame = 8;
  assert.deepEqual(document, original);
  assert.equal(document.clips.filter(clip => clip.mediaPath).length, 6);
});
test('final comparison retains the complete original Prism document', () => {
  assert.deepEqual(prismCase('original').document, loadExample('prism').document);
  assert.throws(() => prismCase('stripped'));
});

test('straight placement fixture exercises fractional transformed keyed pixels over color', async () => {
  const { placementDocument } = await import('./placement-oracle.mjs');
  const document = placementDocument();
  const picture = document.clips.find(clip => clip.mediaType === 'image');
  assert.equal(picture.width, 64);
  assert.equal(picture.height, 64);
  assert.equal(picture.transform.scale.x, 0.95);
  assert.notEqual(picture.transform.rotation, 0);
  assert.notEqual(picture.transform.position.x % 1, 0);
  assert(picture.effects.some(effect => effect.type === 'chromaKey' && effect.enabled));
  assert(picture.effects.some(effect => effect.mode === 'edgeHighlight' && effect.enabled));
  assert(document.clips.some(clip => clip.shapeStyle?.fill === '#8030a0'));
});

test('placement cases retain grouped leaves, colored luma, and cropped effect outsets', async () => {
  const { placementCases } = await import('./placement-oracle.mjs');
  const cases = placementCases();
  assert.deepEqual(cases.map(row => row.name), ['scaled-keyed', 'grouped-keyed', 'colored-luma', 'cropped-outset', 'cropped-outset-no-radius', 'cropped-fractional-quarter', 'cropped-fractional-threequarter']);
  assert(cases[1].document.clips.some(clip => clip.parentId === 'group'));
  assert(cases[2].document.clips.some(clip => clip.matte?.mode === 'luma'));
  assert(cases[2].document.clips.some(clip => clip.shapeStyle?.fillStyle?.stops.some(stop => stop.color.includes('rgba'))));
  for (const row of cases.slice(5)) {
    const shadow = row.document.clips[0].effects.find(effect => effect.type === 'dropShadow');
    assert.notEqual(shadow.offsetX % 1, 0);
    assert.notEqual(shadow.offsetY % 1, 0);
    assert.equal(shadow.opacity, 0.55);
  }
  assert(cases[3].document.clips.some(clip => clip.crop && clip.borderRadius && clip.effects.some(effect => effect.type === 'dropShadow')));
});
