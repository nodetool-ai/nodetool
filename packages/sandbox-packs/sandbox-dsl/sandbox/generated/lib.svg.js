// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function rect(inputs) {
  return createNode("lib.svg.Rect", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function circle(inputs) {
  return createNode("lib.svg.Circle", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function ellipse(inputs) {
  return createNode("lib.svg.Ellipse", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function line(inputs) {
  return createNode("lib.svg.Line", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function polygon(inputs) {
  return createNode("lib.svg.Polygon", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function path(inputs) {
  return createNode("lib.svg.Path", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function text(inputs) {
  return createNode("lib.svg.Text", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function gaussianBlur(inputs) {
  return createNode("lib.svg.GaussianBlur", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function dropShadow(inputs) {
  return createNode("lib.svg.DropShadow", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function document(inputs) {
  return createNode("lib.svg.Document", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function svgToImage(inputs) {
  return createNode("lib.svg.SVGToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function gradient(inputs) {
  return createNode("lib.svg.Gradient", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function transform(inputs) {
  return createNode("lib.svg.Transform", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function clipPath(inputs) {
  return createNode("lib.svg.ClipPath", inputs, { outputNames: ["output"], defaultOutput: "output" });
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
