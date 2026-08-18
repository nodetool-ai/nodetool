// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function forEachRow(inputs) {
  return callNode("nodetool.data.ForEachRow", inputs);
}
forEachRow.stream = function(inputs) {
  return streamNode("nodetool.data.ForEachRow", inputs);
};
function loadCSVAssets(inputs) {
  return callNode("nodetool.data.LoadCSVAssets", inputs);
}
loadCSVAssets.stream = function(inputs) {
  return streamNode("nodetool.data.LoadCSVAssets", inputs);
};
export {
  forEachRow,
  loadCSVAssets
};
