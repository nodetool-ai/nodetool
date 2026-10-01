// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function canny(inputs, options) {
  return createNode("lib.image.filter.Canny", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function contour(inputs, options) {
  return createNode("lib.image.filter.Contour", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function convertToGrayscale(inputs, options) {
  return createNode("lib.image.filter.ConvertToGrayscale", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function emboss(inputs, options) {
  return createNode("lib.image.filter.Emboss", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function expand(inputs, options) {
  return createNode("lib.image.filter.Expand", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function findEdges(inputs, options) {
  return createNode("lib.image.filter.FindEdges", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function invert(inputs, options) {
  return createNode("lib.image.filter.Invert", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function posterize(inputs, options) {
  return createNode("lib.image.filter.Posterize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function smooth(inputs, options) {
  return createNode("lib.image.filter.Smooth", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function solarize(inputs, options) {
  return createNode("lib.image.filter.Solarize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function threshold(inputs, options) {
  return createNode("lib.image.filter.Threshold", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function pixelate(inputs, options) {
  return createNode("lib.image.filter.Pixelate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function gaussianBlur(inputs, options) {
  return createNode("lib.image.filter.GaussianBlur", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function unsharpMask(inputs, options) {
  return createNode("lib.image.filter.UnsharpMask", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function vignette(inputs, options) {
  return createNode("lib.image.filter.Vignette", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
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
