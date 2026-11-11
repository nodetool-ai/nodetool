// Standalone measurement, not a timing assertion. Run with node --import tsx.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import Fastify from 'fastify';
import healthRoute from '../../websocket/src/routes/health.ts';
import { makeClip, makeSequence, makeTrack } from '@nodetool-ai/timeline';
import { renderTimelineComposited } from '../src/nodes/timeline/compositeRender.ts';

const [report, size = '1080', workingFormat = 'rgba8unorm', count = '1', mode = 'render'] = process.argv.slice(2);
assert(report);
assert(['rgba8unorm', 'rgba16float'].includes(workingFormat));
const width = size === '2160' ? 3840 : 1920;
const height = Number(size);
const cap = Number(count);
assert.equal(process.env.NODETOOL_TIMELINE_RENDER_CONCURRENCY, count);
const durationMs = Number(process.env.A49_DURATION_MS ?? 10000);
const tracks = [0, 1, 2].map(index => makeTrack({ id: `v${index}`, type: 'video', index }));
const clip = (id, trackId, fill, extra = {}) => makeClip({ id, trackId, mediaType: 'shape', startMs: 0,
  durationMs, shapeStyle: { kind: 'rect', fill }, ...extra });
const sequence = makeSequence({ width, height, fps: 30, durationMs, tracks, clips: [
  clip('background', 'v2', '#194565'),
  clip('outgoing', 'v1', '#df7834', { durationMs: durationMs * 0.6, fadeOutMs: durationMs * 0.2,
    effects: [{ id: 'blur', type: 'blur', enabled: true, radius: 6 }], opacity: 0.7, transform: { position: { x: -width / 8, y: 0 }, scale: { x: 0.65, y: 0.65 }, rotation: 8, anchor: { x: 0.5, y: 0.5 } } }),
  clip('incoming', 'v1', '#426ac9', { startMs: durationMs * 0.4, durationMs: durationMs * 0.6,
    fadeInMs: durationMs * 0.2, opacity: 0.7 }),
  clip('foreground', 'v0', '#f3d89c', { opacity: 0.25, transform: { position: { x: width / 5, y: height / 5 }, scale: { x: 0.4, y: 0.3 }, rotation: -12, anchor: { x: 0.5, y: 0.5 } },
    effects: [{ id: 'grain', type: 'grain', enabled: true, seed: 7, amount: 0.15, size: 1 }] })
] });
const dir = await mkdtemp(join(tmpdir(), 'a49-output-'));
// Real production HTTP plugin in the rendering process. No substitute route.
const app = Fastify({ logger: false });
await app.register(healthRoute);
await app.listen({ host: '127.0.0.1', port: 0 });
const address = app.server.address();
assert(address && typeof address === 'object' && address.port !== 7777);
const eventLoop = monitorEventLoopDelay({ resolution: 10 });
eventLoop.enable();
const snapshot = () => ({ p50: eventLoop.percentile(50) / 1e6, p95: eventLoop.percentile(95) / 1e6, max: eventLoop.max / 1e6 });
const output = { pid: process.pid, port: address.port, phase: 'baseline', size, workingFormat, cap,
  mode, durationMs, cores: cpus().length, cpu: cpus()[0].model, lpThreads: process.env.LP_NUM_THREADS ?? 'unset', loadStart: loadavg() };
const cgroup = readFileSync('/proc/self/cgroup', 'utf8').trim().split('0::')[1];
assert(cgroup);
output.cgroupLimits = {
  cpu: existsSync(`/sys/fs/cgroup${cgroup}/cpu.max`)
    ? readFileSync(`/sys/fs/cgroup${cgroup}/cpu.max`, 'utf8').trim() : 'not configured at scope',
  memory: readFileSync(`/sys/fs/cgroup${cgroup}/memory.max`, 'utf8').trim()
};
await writeFile(report, JSON.stringify(output));
await new Promise(resolve => setTimeout(resolve, 5000));
output.baselineEventLoop = snapshot();
eventLoop.reset();
output.phase = 'render';
await writeFile(report, JSON.stringify(output));
const start = performance.now();
const cpuStart = process.cpuUsage();
const controllers = Array.from({ length: cap + 1 }, () => new AbortController());
const progress = Array(cap + 1).fill(0);
let abortAt;
let replacementWhileBusy = false;
const heartbeat = setInterval(() => {
  output.progress = [...progress];
  output.elapsedMs = performance.now() - start;
  output.eventLoop = snapshot();
  output.peakRssMiB = process.resourceUsage().maxRSS / 1024;
  writeFileSync(report, JSON.stringify(output));
}, 1000);
try {
  const jobs = Array.from({ length: cap + (mode === 'cancel' ? 1 : 0) }, (_, i) => {
    const outPath = join(dir, `${i}.mp4`);
    return renderTimelineComposited({ sequence, width, height, fps: 30, durationMs, workingFormat,
      outPath, resolveAssetPath: async () => null, signal: controllers[i].signal,
      onProgress(frame) {
        progress[i] = frame;
        if (mode === 'cancel' && i === cap && progress[1] > 0 && progress[1] < Math.ceil(durationMs * 30 / 1000)) replacementWhileBusy = true;
        if (mode === 'cancel' && i === 0 && frame >= 10 && !controllers[0].signal.aborted) {
          abortAt = performance.now();
          controllers[0].abort();
        }
      }
    }).then(async result => {
      assert(result.complete && result.totalFrames === Math.ceil(durationMs * 30 / 1000));
      assert.equal(result.diagnostics.length, 0);
      assert((await stat(outPath)).size > 0);
      return { ...result, elapsedMs: performance.now() - start };
    }, async error => {
      if (mode !== 'cancel' || i !== 0) throw error;
      assert.equal(error.name, 'AbortError');
      await assert.rejects(stat(outPath), { code: 'ENOENT' });
      return { aborted: true, cleanupMs: performance.now() - abortAt, otherProgress: [...progress] };
    });
  });
  output.results = await Promise.all(jobs);
  if (mode === 'cancel') {
    assert(replacementWhileBusy, 'Replacement must use released slot while another render runs');
    output.replacementWhileBusy = replacementWhileBusy;
  }
  output.elapsedMs = performance.now() - start;
  const usage = process.cpuUsage(cpuStart);
  output.cpuPercent = (usage.user + usage.system) / (output.elapsedMs * 10);
  output.framesRendered = output.results.reduce((sum, result, i) => sum + (result.aborted ? progress[i] : result.totalFrames), 0);
  output.fps = output.framesRendered / (output.elapsedMs / 1000);
  output.peakRssMiB = process.resourceUsage().maxRSS / 1024;
  output.eventLoop = snapshot();
  output.loadEnd = loadavg();
  output.phase = 'done';
  await writeFile(report, JSON.stringify(output));
} finally {
  clearInterval(heartbeat);
  eventLoop.disable();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
process.exit(0);
