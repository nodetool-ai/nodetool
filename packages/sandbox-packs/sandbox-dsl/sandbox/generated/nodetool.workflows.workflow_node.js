// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function workflow(inputs) {
  return createNode("nodetool.workflows.workflow_node.Workflow", inputs, { outputNames: [], streaming: true });
}
export {
  workflow
};
