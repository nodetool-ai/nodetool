// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function adaptiveContrast(inputs, options) {
  return createNode("lib.image.enhance.AdaptiveContrast", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function autoContrast(inputs, options) {
  return createNode("lib.image.enhance.AutoContrast", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function detail(inputs, options) {
  return createNode("lib.image.enhance.Detail", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function edgeEnhance(inputs, options) {
  return createNode("lib.image.enhance.EdgeEnhance", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function equalize(inputs, options) {
  return createNode("lib.image.enhance.Equalize", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
function rankFilter(inputs, options) {
  return createNode("lib.image.enhance.RankFilter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "image" }, defaultOutput: "output" });
}
export {
  adaptiveContrast,
  autoContrast,
  detail,
  edgeEnhance,
  equalize,
  rankFilter
};
