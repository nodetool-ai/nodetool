import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPECTED_EXAMPLES, assertCatalog, auditResults, deferredProjection } from './audit.mjs';
import { loadExample } from './oracle.mjs';
function results() {
  return EXPECTED_EXAMPLES.map(slug => {
    const { document } = loadExample(slug);
    const total = Math.ceil(document.durationMs * document.fps / 1000);
    const frames = Array.from({ length: 8 }, (_, i) => Math.floor((i + 0.5) * total / 8));
    return { slug, clips: document.clips.length, media: document.clips.filter(clip => clip.mediaPath).length, frames,
      pairs: frames.map(frame => ({ frame, psnr: 50, pass: true })), pass: true };
  });
}
test('scope audit retains explicit projected failures without changing the raw full verdict', () => {
  const rows = results();
  const prism = rows.find(row => row.slug === 'prism');
  for (const pair of prism.pairs) {
    if (pair.frame === 450) {
      Object.assign(pair, { psnr: 15, pass: false });
    }
  }
  prism.pass = false;
  const before = structuredClone(rows);
  const audit = auditResults(rows);
  assert.equal(audit.nonDeferredPairs, 55);
  assert.equal(audit.fullOraclePass, false);
  assert.deepEqual(audit.deferred.map(row => row.clipId), ['S5_s4']);
  assert.deepEqual(rows, before);
});
test('scope audit rejects unknown failures, missing frames, render errors and catalog drift', () => {
  const rows = results();
  Object.assign(rows.find(row => row.slug === 'kite').pairs[3], { pass: false, psnr: 37 });
  rows.find(row => row.slug === 'kite').pass = false;
  assert.throws(() => auditResults(rows), /non-deferred/);
  const projected = results();
  const prism = projected.find(row => row.slug === 'prism');
  Object.assign(prism.pairs.find(pair => pair.frame === 312), { pass: false, psnr: 38 });
  prism.pass = false;
  assert.throws(() => auditResults(projected), /prism frame 312: non-deferred/);
  const missing = results(); missing[0].pairs.pop();
  assert.throws(() => auditResults(missing), /missing, duplicate/);
  const reordered = results(); reordered[0].pairs.reverse();
  assert.throws(() => auditResults(reordered), /missing, duplicate/);
  const error = results(); error.find(row => row.slug === 'prism').error = 'capture timeout';
  assert.throws(() => auditResults(error), /cannot be deferred/);
  assert.throws(() => assertCatalog([]));
  assert.throws(() => assertCatalog([...EXPECTED_EXAMPLES, 'new-example']));
});
test('deferral guards reject shifted projection timing and changed source fields', () => {
  const { document } = loadExample('prism');
  assert.equal(deferredProjection(document, 520), null);
  assert.equal(deferredProjection(document, 312), null);
  const shifted = structuredClone(document);
  shifted.clips.find(clip => clip.id === 'S5_s4').startMs = 0;
  assert.throws(() => deferredProjection(shifted, 450));
  document.clips.find(clip => clip.id === 'S5_s4').transform.rotationX = 0;
  assert.throws(() => deferredProjection(document, 450));
});
