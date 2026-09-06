/**
 * Spawns the midi render worker.
 *
 * Its own module for the same reason as `lib/workflow/browserWorkerClient.ts`:
 * Vite only rewrites a *static* `new URL("./x.worker.ts", import.meta.url)`
 * into the worker's built asset, and the CommonJS transform Jest runs cannot
 * parse `import.meta` at all. So the URL is written once, statically, here,
 * and Jest maps this module to `__mocks__/midiRenderWorkerClient.ts`.
 */
export function createMidiRenderWorker(): Worker {
  return new Worker(new URL("./midiRender.worker.ts", import.meta.url), {
    type: "module"
  });
}
