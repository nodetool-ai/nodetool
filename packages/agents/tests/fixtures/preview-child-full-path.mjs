import { readFileSync } from 'node:fs';
const { renderTimelineFrames } = await import(process.env.S5_COMPILED ? '../../dist/timeline-preview/frames.js' : '../../src/timeline-preview/frames.ts');
const sequence = {
  id: 'preview', projectId: 'project', name: 'Probe', width: 160, height: 90,
  fps: 30, durationMs: 1000, markers: [], createdAt: '', updatedAt: '',
  tracks: [{ id: 'track', name: 'Track', type: 'video', index: 0, visible: true, locked: false }],
  clips: [{ id: 'shape', name: 'Shape', trackId: 'track', startMs: 0, durationMs: 1000,
    mediaType: 'shape', sourceType: 'generated', status: 'ready', shapeStyle: { shape: 'rectangle', fill: '#ff0000' } }]
};
const options = { sequence, width: 160, timesMs: [0, 500], loadAsset: async () => null };
let peakBytes = 0;
let peakSample;
const childPeaks = {};
// Let module initialization settle before any CPU or GPU render.
await new Promise(resolve => setTimeout(resolve, 1000));
const parentBaseline = process.memoryUsage().rss;
let parentPeak = parentBaseline;
let childrenPeak = 0;
function rss(pid) {
  try { return Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)?.[1] ?? 0) * 1024; }
  catch { return 0; }
}
const sampler = setInterval(() => {
  const children = readFileSync(`/proc/self/task/${process.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean);
  const parent = rss(process.pid);
  const childRss = Object.fromEntries(children.map(pid => [pid, rss(pid)]));
  for (const [pid, bytes] of Object.entries(childRss)) childPeaks[pid] = Math.max(childPeaks[pid] ?? 0, bytes);
  const childrenTotal = Object.values(childRss).reduce((sum, bytes) => sum + bytes, 0);
  parentPeak = Math.max(parentPeak, parent);
  childrenPeak = Math.max(childrenPeak, childrenTotal);
  const total = parent + childrenTotal;
  if (total > peakBytes) { peakBytes = total; peakSample = { parent, children: childRss }; }
}, 25);
const timings = [];
let firstRss;
for (let i = 0; i < Number(process.env.S5_CYCLES ?? 20); i++) {
  const start = performance.now();
  const result = await renderTimelineFrames(options, true);
  if (!result.complete || result.frames.length !== options.timesMs.length) throw new Error('Incomplete probe');
  timings.push(performance.now() - start);
  firstRss ??= process.memoryUsage().rss;
}
const growthBytes = process.memoryUsage().rss - firstRss;
const serialPeak = { peakBytes, peakSample, parentPeak, childrenPeak, parentGrowth: Math.max(0, parentPeak - parentBaseline), addedBytes: childrenPeak + Math.max(0, parentPeak - parentBaseline) };
peakBytes = 0;
parentPeak = parentBaseline;
childrenPeak = 0;
const concurrency = [];
for (const count of [2, 4]) {
  const start = performance.now();
  const completionsMs = await Promise.all(Array.from({ length: count }, async () => {
    await renderTimelineFrames(options, true);
    return performance.now() - start;
  }));
  concurrency.push({ count, completionsMs });
}
clearInterval(sampler);
const concurrentPeak = { peakBytes, peakSample, parentPeak, childrenPeak, parentGrowth: Math.max(0, parentPeak - parentBaseline), addedBytes: childrenPeak + Math.max(0, parentPeak - parentBaseline) };
const concurrentMs = concurrency[0].completionsMs.at(-1);
const start = performance.now();
await renderTimelineFrames(options, false);
const cpuMs = performance.now() - start;
console.log(JSON.stringify({ cpuMs, timings, concurrency, concurrentMs, serialPeak, concurrentPeak, peakBytes, peakSample, childPeaks, parentBaseline, growthBytes }));
