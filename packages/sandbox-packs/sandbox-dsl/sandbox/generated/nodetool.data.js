// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function forEachRow(inputs) {
  return createNode("nodetool.data.ForEachRow", inputs, { outputNames: ["row", "index"], streaming: true });
}
function loadCSVAssets(inputs) {
  return createNode("nodetool.data.LoadCSVAssets", inputs, { outputNames: ["dataframe", "name", "dataframes", "names"], streaming: true });
}
export {
  forEachRow,
  loadCSVAssets
};
