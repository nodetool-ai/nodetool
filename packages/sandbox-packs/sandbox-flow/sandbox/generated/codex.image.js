// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function createImage(inputs) {
  return callNode("codex.image.CreateImage", inputs);
}
export {
  createImage
};
