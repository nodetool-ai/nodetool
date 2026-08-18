// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function workflow(inputs) {
  return callNode("nodetool.workflows.workflow_node.Workflow", inputs);
}
workflow.stream = function(inputs) {
  return streamNode("nodetool.workflows.workflow_node.Workflow", inputs);
};
export {
  workflow
};
