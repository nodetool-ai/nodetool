// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function forEachRow(inputs, options) {
  return createNode("nodetool.data.ForEachRow", inputs, { id: options?.id, outputNames: ["row", "index"], outputTypes: { "row": "dict", "index": "any" }, streaming: true, inputMode: "buffered", outputCorrelation: { "row": { "kind": "iteration", "source": "dataframe", "group": "items" }, "index": { "kind": "iteration", "source": "dataframe", "group": "items" } } });
}
function loadCSVAssets(inputs, options) {
  return createNode("nodetool.data.LoadCSVAssets", inputs, { id: options?.id, outputNames: ["dataframe", "name", "dataframes", "names"], outputTypes: { "dataframe": "dataframe", "name": "str", "dataframes": "list", "names": "list" }, streaming: true, inputMode: "buffered", outputCorrelation: { "dataframe": { "kind": "iteration", "source": "folder", "group": "items" }, "name": { "kind": "iteration", "source": "folder", "group": "items" }, "dataframes": { "kind": "single", "source": "folder" }, "names": { "kind": "single", "source": "folder" } } });
}
export {
  forEachRow,
  loadCSVAssets
};
