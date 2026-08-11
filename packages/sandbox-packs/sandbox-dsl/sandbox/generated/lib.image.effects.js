// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function colorOverlay(inputs) {
  return createNode("lib.image.effects.ColorOverlay", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function outline(inputs) {
  return createNode("lib.image.effects.Outline", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function dropShadow(inputs) {
  return createNode("lib.image.effects.DropShadow", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function glow(inputs) {
  return createNode("lib.image.effects.Glow", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function add(inputs) {
  return createNode("lib.image.effects.Add", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  add,
  colorOverlay,
  dropShadow,
  glow,
  outline
};
