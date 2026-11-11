import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderTimelineFrames } from '../../dist/timeline-preview/frames.js';

const fixture = JSON.parse(readFileSync(new URL('../../../../demo/benchmarks/serein/timeline-gap-repro.json', import.meta.url), 'utf8'));
const sequence = { ...fixture, ...fixture.document, projectId: 'qualification', createdAt: '', updatedAt: '' };
const timesMs = sequence.clips.map(clip => clip.startMs + clip.durationMs / 2);
const options = { sequence, timesMs: [...new Set(timesMs)], width: 480, loadAsset: async () => null };
async function pixels(png) {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
}
const before = await renderTimelineFrames(options, false);
const after = await renderTimelineFrames(options, true);
const frames = [];
for (let i = 0; i < before.frames.length; i++) {
  const a = await pixels(before.frames[i].png);
  const b = await pixels(after.frames[i].png);
  let max = 0, sum = 0, changed = 0;
  for (let j = 0; j < a.length; j++) {
    const delta = Math.abs(a[j] - b[j]);
    max = Math.max(max, delta);
    sum += delta;
    if (delta) changed++;
  }
  frames.push({ timeMs: before.frames[i].time_ms, maxChannelDelta: max, meanAbsoluteChannelDelta: sum / a.length, changedChannels: changed, totalChannels: a.length,
    beforeEffects: before.frames[i].effects_not_applied, afterEffects: after.frames[i].effects_not_applied });
}
console.log(JSON.stringify({ frames, beforeEffects: before.effectsNotApplied, afterEffects: after.effectsNotApplied }));
