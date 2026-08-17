// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function canny(inputs) {
  return callNode("lib.image.filter.Canny", inputs);
}
function contour(inputs) {
  return callNode("lib.image.filter.Contour", inputs);
}
function convertToGrayscale(inputs) {
  return callNode("lib.image.filter.ConvertToGrayscale", inputs);
}
function emboss(inputs) {
  return callNode("lib.image.filter.Emboss", inputs);
}
function expand(inputs) {
  return callNode("lib.image.filter.Expand", inputs);
}
function findEdges(inputs) {
  return callNode("lib.image.filter.FindEdges", inputs);
}
function invert(inputs) {
  return callNode("lib.image.filter.Invert", inputs);
}
function posterize(inputs) {
  return callNode("lib.image.filter.Posterize", inputs);
}
function smooth(inputs) {
  return callNode("lib.image.filter.Smooth", inputs);
}
function solarize(inputs) {
  return callNode("lib.image.filter.Solarize", inputs);
}
function threshold(inputs) {
  return callNode("lib.image.filter.Threshold", inputs);
}
function pixelate(inputs) {
  return callNode("lib.image.filter.Pixelate", inputs);
}
function gaussianBlur(inputs) {
  return callNode("lib.image.filter.GaussianBlur", inputs);
}
function unsharpMask(inputs) {
  return callNode("lib.image.filter.UnsharpMask", inputs);
}
function vignette(inputs) {
  return callNode("lib.image.filter.Vignette", inputs);
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
