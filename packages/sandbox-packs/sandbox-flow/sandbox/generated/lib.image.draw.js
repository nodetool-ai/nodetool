// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function background(inputs) {
  return callNode("lib.image.draw.Background", inputs);
}
function gaussianNoise(inputs) {
  return callNode("lib.image.draw.GaussianNoise", inputs);
}
function renderText(inputs) {
  return callNode("lib.image.draw.RenderText", inputs);
}
function linearGradient(inputs) {
  return callNode("lib.image.draw.LinearGradient", inputs);
}
function radialGradient(inputs) {
  return callNode("lib.image.draw.RadialGradient", inputs);
}
function angularGradient(inputs) {
  return callNode("lib.image.draw.AngularGradient", inputs);
}
function diamondGradient(inputs) {
  return callNode("lib.image.draw.DiamondGradient", inputs);
}
function checkerboard(inputs) {
  return callNode("lib.image.draw.Checkerboard", inputs);
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
