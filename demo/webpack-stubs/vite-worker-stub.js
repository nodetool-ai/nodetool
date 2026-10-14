// Stand-in for Vite's `?worker` imports (Monaco's language-service workers in
// web/src/hooks/editor/monacoWorkers.ts). Webpack does not understand the
// query, so the default export would not be a constructor and the first Code
// node on screen would crash the render. This worker never answers: a
// recording shows code but needs no diagnostics, and Monaco colours syntax on
// the main thread.
export default class ViteWorkerStub extends EventTarget {
  onmessage = null;
  onmessageerror = null;
  onerror = null;
  postMessage() {}
  terminate() {}
}
