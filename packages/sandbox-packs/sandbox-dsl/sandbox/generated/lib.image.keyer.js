// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function chromaKey(inputs) {
  return createNode("lib.image.keyer.ChromaKey", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function lumaKey(inputs) {
  return createNode("lib.image.keyer.LumaKey", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  chromaKey,
  lumaKey
};
