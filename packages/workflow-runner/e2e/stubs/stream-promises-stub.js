// Browser-safe `node:stream/promises` substitute. `@comfyorg/sdk`, which the
// runtime's Comfy Cloud provider imports, destructures `pipeline` at module
// load; browser-tagged execution never calls it.
export const pipeline = () => {
  throw new Error("Stubbed stream/promises.pipeline called from a browser bundle");
};
export const finished = () => {
  throw new Error("Stubbed stream/promises.finished called from a browser bundle");
};
export default { pipeline, finished };
