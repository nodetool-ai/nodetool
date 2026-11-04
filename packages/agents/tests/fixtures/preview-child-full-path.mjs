import { readFileSync } from 'node:fs';
import { renderTimelineFrames } from '../../src/timeline-preview/frames.ts';
const sequence = {
  id: 'preview', projectId: 'project', name: 'Probe', width: 160, height: 90,
  fps: 30, durationMs: 1000, markers: [], createdAt: '', updatedAt: '',
  tracks: [{ id: 'track', name: 'Track', type: 'video', index: 0, visible: true, locked: false }],
  clips: [{ id: 'shape', name: 'Shape', trackId: 'track', startMs: 0, durationMs: 1000,
    mediaType: 'shape', sourceType: 'generated', status: 'ready', shapeStyle: { shape: 'rectangle', fill: '#ff0000' } }]
};
const options = { sequence, width: 160, timesMs: [0, 500], loadAsset: async () => null };
let peakBytes = 0;
function rss(pid) {
  try { return Number(readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)?.[1] ?? 0) * 1024; }
  catch { return 0; }
}
const sampler = setInterval(() => {
  const children = readFileSync(`/proc/self/task/${process.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean);
  peakBytes = Math.max(peakBytes, rss(process.pid) + children.reduce((sum, pid) => sum + rss(pid), 0));
}, 25);
const start = performance.now();
const before = await renderTimelineFrames(options);
const cpuMs = performance.now() - start;
const timings = [];
let firstRss;
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  const result = await renderTimelineFrames(options, true);
  if (!result.complete || result.frames.length !== before.frames.length) throw new Error('Incomplete probe');
  timings.push(performance.now() - start);
  firstRss ??= process.memoryUsage().rss;
}
const growthBytes = process.memoryUsage().rss - firstRss;
const concurrentStart = performance.now();
await Promise.all([renderTimelineFrames(options, true), renderTimelineFrames(options, true)]);
clearInterval(sampler);
console.log(JSON.stringify({ cpuMs, timings, concurrentMs: performance.now() - concurrentStart, peakBytes, growthBytes }));
