// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function sliceImageGrid(inputs) {
  return callNode("lib.grid.SliceImageGrid", inputs);
}
export {
  sliceImageGrid
};
