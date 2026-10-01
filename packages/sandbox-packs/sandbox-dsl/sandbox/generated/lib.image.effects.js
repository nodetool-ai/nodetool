// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function colorOverlay(inputs, options) {
  return createNode("lib.image.effects.ColorOverlay", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function outline(inputs, options) {
  return createNode("lib.image.effects.Outline", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function dropShadow(inputs, options) {
  return createNode("lib.image.effects.DropShadow", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function glow(inputs, options) {
  return createNode("lib.image.effects.Glow", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function add(inputs, options) {
  return createNode("lib.image.effects.Add", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  add,
  colorOverlay,
  dropShadow,
  glow,
  outline
};
