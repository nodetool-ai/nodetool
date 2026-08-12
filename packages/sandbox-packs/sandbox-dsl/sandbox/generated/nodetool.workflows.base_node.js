// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function preview(inputs) {
  return createNode("nodetool.workflows.base_node.Preview", inputs, { outputNames: [] });
}
export {
  preview
};
