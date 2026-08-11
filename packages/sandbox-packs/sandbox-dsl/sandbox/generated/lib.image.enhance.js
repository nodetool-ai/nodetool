// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function adaptiveContrast(inputs) {
  return createNode("lib.image.enhance.AdaptiveContrast", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function autoContrast(inputs) {
  return createNode("lib.image.enhance.AutoContrast", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function detail(inputs) {
  return createNode("lib.image.enhance.Detail", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function edgeEnhance(inputs) {
  return createNode("lib.image.enhance.EdgeEnhance", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function equalize(inputs) {
  return createNode("lib.image.enhance.Equalize", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function rankFilter(inputs) {
  return createNode("lib.image.enhance.RankFilter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  adaptiveContrast,
  autoContrast,
  detail,
  edgeEnhance,
  equalize,
  rankFilter
};
