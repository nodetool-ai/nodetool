import { Worker, isMainThread, parentPort } from 'node:worker_threads';
if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url));
  worker.on('error', (error) => { throw error; });
  worker.on('message', async (message) => {
    console.log(JSON.stringify(message));
    await worker.terminate();
    console.log('worker terminated');
  });
} else {
  const { register } = await import('tsx/esm/api');
  register();
  await import('./shared-preview-completion.mjs');
  parentPort.postMessage({ rendered: true });
}
