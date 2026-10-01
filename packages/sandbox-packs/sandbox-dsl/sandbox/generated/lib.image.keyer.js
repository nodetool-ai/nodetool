// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function chromaKey(inputs, options) {
  return createNode("lib.image.keyer.ChromaKey", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function lumaKey(inputs, options) {
  return createNode("lib.image.keyer.LumaKey", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  chromaKey,
  lumaKey
};
