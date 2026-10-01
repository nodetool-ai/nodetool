// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function preview(inputs, options) {
  return createNode("nodetool.workflows.base_node.Preview", inputs, { id: options?.id, outputNames: [], outputTypes: {} });
}
export {
  preview
};
