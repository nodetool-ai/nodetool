// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function sliceImageGrid(inputs, options) {
  return createNode("lib.grid.SliceImageGrid", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "list[image]" }, defaultOutput: "output" });
}
export {
  sliceImageGrid
};
