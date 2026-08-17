// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function colorOverlay(inputs) {
  return callNode("lib.image.effects.ColorOverlay", inputs);
}
function outline(inputs) {
  return callNode("lib.image.effects.Outline", inputs);
}
function dropShadow(inputs) {
  return callNode("lib.image.effects.DropShadow", inputs);
}
function glow(inputs) {
  return callNode("lib.image.effects.Glow", inputs);
}
function add(inputs) {
  return callNode("lib.image.effects.Add", inputs);
}
export {
  add,
  colorOverlay,
  dropShadow,
  glow,
  outline
};
