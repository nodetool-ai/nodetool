// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function apply(inputs) {
  return callNode("lib.image.mask.Apply", inputs);
}
function fromImage(inputs) {
  return callNode("lib.image.mask.FromImage", inputs);
}
function invert(inputs) {
  return callNode("lib.image.mask.Invert", inputs);
}
export {
  apply,
  fromImage,
  invert
};
