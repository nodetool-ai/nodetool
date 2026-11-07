import { getNodeGPUDevice } from '@nodetool-ai/gpu/node';
import { HeadlessFrameCompositor } from '@nodetool-ai/timeline/render';
const start = performance.now();
const device = await getNodeGPUDevice();
const data = new Uint8Array(160 * 90 * 4);
for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 3] = 255; }
const layers = [{ id: 'shape', source: { rgba: data, width: 160, height: 90 }, opacity: 1, blendMode: 'normal', zIndex: 0 }];
async function pass() {
  const compositor = new HeadlessFrameCompositor(device, 160, 90);
  try { return await compositor.renderFrame(layers); }
  finally { compositor.dispose(); }
}
const rgba = await pass();
const coldMs = performance.now() - start;
const rssBefore = process.memoryUsage().rss;
const timings = [];
for (let i = 0; i < 20; i++) {
  const before = performance.now();
  await pass();
  timings.push(performance.now() - before);
}
const rssAfter = process.memoryUsage().rss;
const concurrentStart = performance.now();
await Promise.all([pass(), pass()]);
const result = { bytes: rgba.length, coldMs, timings,
  concurrentMs: performance.now() - concurrentStart, rssGrowthBytes: rssAfter - rssBefore,
  maxRssKiB: process.resourceUsage().maxRSS, adapter: device.adapterInfo };
console.log(JSON.stringify(result));
if (process.send) process.send(result);
