// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function preview(inputs) {
  return callNode("nodetool.workflows.base_node.Preview", inputs);
}
export {
  preview
};
