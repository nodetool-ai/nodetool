// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function canny(inputs) {
  return createNode("lib.image.filter.Canny", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function contour(inputs) {
  return createNode("lib.image.filter.Contour", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function convertToGrayscale(inputs) {
  return createNode("lib.image.filter.ConvertToGrayscale", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function emboss(inputs) {
  return createNode("lib.image.filter.Emboss", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function expand(inputs) {
  return createNode("lib.image.filter.Expand", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function findEdges(inputs) {
  return createNode("lib.image.filter.FindEdges", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function invert(inputs) {
  return createNode("lib.image.filter.Invert", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function posterize(inputs) {
  return createNode("lib.image.filter.Posterize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function smooth(inputs) {
  return createNode("lib.image.filter.Smooth", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function solarize(inputs) {
  return createNode("lib.image.filter.Solarize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function threshold(inputs) {
  return createNode("lib.image.filter.Threshold", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function pixelate(inputs) {
  return createNode("lib.image.filter.Pixelate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function gaussianBlur(inputs) {
  return createNode("lib.image.filter.GaussianBlur", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function unsharpMask(inputs) {
  return createNode("lib.image.filter.UnsharpMask", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function vignette(inputs) {
  return createNode("lib.image.filter.Vignette", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  canny,
  contour,
  convertToGrayscale,
  emboss,
  expand,
  findEdges,
  gaussianBlur,
  invert,
  pixelate,
  posterize,
  smooth,
  solarize,
  threshold,
  unsharpMask,
  vignette
};
