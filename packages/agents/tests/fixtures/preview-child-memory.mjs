import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (!process.send) {
  const child = fork(fileURLToPath(import.meta.url), [], { execArgv: process.env.S5_COMPILED ? [] : ['--import', 'tsx'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  const timer = setTimeout(() => child.kill('SIGKILL'), 30000);
  child.on('message', message => {
    console.log(JSON.stringify(message));
    if (message.stage === 'idle') child.kill('SIGTERM');
  });
  child.on('exit', (code, signal) => { clearTimeout(timer); if (signal !== 'SIGTERM') process.exitCode = 1; });
} else {
  const report = (stage, extra = {}) => process.send({ stage, ...process.memoryUsage(), ...extra });
  report('node');
  const { getNodeGPUDevice } = await import('@nodetool-ai/gpu/node');
  const { HeadlessFrameCompositor } = await import(process.env.S5_BROAD_IMPORT ? '@nodetool-ai/timeline/render' : '@nodetool-ai/timeline/frame-compositor');
  report('modules');
  const device = await getNodeGPUDevice();
  report('device', { adapter: { vendor: device.adapterInfo.vendor, architecture: device.adapterInfo.architecture, device: device.adapterInfo.device, description: device.adapterInfo.description } });
  const compositor = new HeadlessFrameCompositor(device, 160, 90);
  report('targets');
  const layers = [{ id: 'shape', source: { width: 160, height: 90, rgba: new Uint8Array(160 * 90 * 4).fill(255) }, sourceWidth: 160, sourceHeight: 90, opacity: 1, blendMode: 'normal', zIndex: 0 }];
  const start = performance.now();
  await compositor.renderFrame(layers);
  report('first', { ms: performance.now() - start });
  const warm = performance.now();
  for (let i = 0; i < 20; i++) await compositor.renderFrame(layers);
  report('warm', { msPerFrame: (performance.now() - warm) / 20 });
  setTimeout(() => report('idle'), 1000);
}
