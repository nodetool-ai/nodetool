// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function background(inputs, options) {
  return createNode("lib.image.draw.Background", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function gaussianNoise(inputs, options) {
  return createNode("lib.image.draw.GaussianNoise", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function renderText(inputs, options) {
  return createNode("lib.image.draw.RenderText", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function linearGradient(inputs, options) {
  return createNode("lib.image.draw.LinearGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function radialGradient(inputs, options) {
  return createNode("lib.image.draw.RadialGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function angularGradient(inputs, options) {
  return createNode("lib.image.draw.AngularGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function diamondGradient(inputs, options) {
  return createNode("lib.image.draw.DiamondGradient", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function checkerboard(inputs, options) {
  return createNode("lib.image.draw.Checkerboard", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  angularGradient,
  background,
  checkerboard,
  diamondGradient,
  gaussianNoise,
  linearGradient,
  radialGradient,
  renderText
};
