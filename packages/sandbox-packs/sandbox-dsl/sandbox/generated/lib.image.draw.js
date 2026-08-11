// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function background(inputs) {
  return createNode("lib.image.draw.Background", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function gaussianNoise(inputs) {
  return createNode("lib.image.draw.GaussianNoise", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function renderText(inputs) {
  return createNode("lib.image.draw.RenderText", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function linearGradient(inputs) {
  return createNode("lib.image.draw.LinearGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function radialGradient(inputs) {
  return createNode("lib.image.draw.RadialGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function angularGradient(inputs) {
  return createNode("lib.image.draw.AngularGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function diamondGradient(inputs) {
  return createNode("lib.image.draw.DiamondGradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function checkerboard(inputs) {
  return createNode("lib.image.draw.Checkerboard", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
