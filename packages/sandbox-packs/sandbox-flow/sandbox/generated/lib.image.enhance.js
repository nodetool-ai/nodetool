// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function adaptiveContrast(inputs) {
  return callNode("lib.image.enhance.AdaptiveContrast", inputs);
}
function autoContrast(inputs) {
  return callNode("lib.image.enhance.AutoContrast", inputs);
}
function detail(inputs) {
  return callNode("lib.image.enhance.Detail", inputs);
}
function edgeEnhance(inputs) {
  return callNode("lib.image.enhance.EdgeEnhance", inputs);
}
function equalize(inputs) {
  return callNode("lib.image.enhance.Equalize", inputs);
}
function rankFilter(inputs) {
  return callNode("lib.image.enhance.RankFilter", inputs);
}
export {
  adaptiveContrast,
  autoContrast,
  detail,
  edgeEnhance,
  equalize,
  rankFilter
};
