/**
 * Resolves the chunk-player AudioWorklet module URL.
 *
 * Isolated in its own module (and only ever loaded via dynamic import) so the
 * `import.meta.url` reference never reaches the jest CJS transform — same
 * pattern as `browserWorkerClient.ts`.
 */
export function getChunkPlayerWorkletUrl(): string {
  return new URL("./chunkPlayerProcessor.js", import.meta.url).toString();
}
