// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function rect(inputs) {
  return callNode("lib.svg.Rect", inputs);
}
function circle(inputs) {
  return callNode("lib.svg.Circle", inputs);
}
function ellipse(inputs) {
  return callNode("lib.svg.Ellipse", inputs);
}
function line(inputs) {
  return callNode("lib.svg.Line", inputs);
}
function polygon(inputs) {
  return callNode("lib.svg.Polygon", inputs);
}
function path(inputs) {
  return callNode("lib.svg.Path", inputs);
}
function text(inputs) {
  return callNode("lib.svg.Text", inputs);
}
function gaussianBlur(inputs) {
  return callNode("lib.svg.GaussianBlur", inputs);
}
function dropShadow(inputs) {
  return callNode("lib.svg.DropShadow", inputs);
}
function document(inputs) {
  return callNode("lib.svg.Document", inputs);
}
function svgToImage(inputs) {
  return callNode("lib.svg.SVGToImage", inputs);
}
function gradient(inputs) {
  return callNode("lib.svg.Gradient", inputs);
}
function transform(inputs) {
  return callNode("lib.svg.Transform", inputs);
}
function clipPath(inputs) {
  return callNode("lib.svg.ClipPath", inputs);
}
export {
  circle,
  clipPath,
  document,
  dropShadow,
  ellipse,
  gaussianBlur,
  gradient,
  line,
  path,
  polygon,
  rect,
  svgToImage,
  text,
  transform
};
