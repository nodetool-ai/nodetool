// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function chromaKey(inputs) {
  return callNode("lib.image.keyer.ChromaKey", inputs);
}
function lumaKey(inputs) {
  return callNode("lib.image.keyer.LumaKey", inputs);
}
export {
  chromaKey,
  lumaKey
};
