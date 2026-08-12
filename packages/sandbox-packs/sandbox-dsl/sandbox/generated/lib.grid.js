// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function sliceImageGrid(inputs) {
  return createNode("lib.grid.SliceImageGrid", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function combineImageGrid(inputs) {
  return createNode("lib.grid.CombineImageGrid", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  combineImageGrid,
  sliceImageGrid
};
