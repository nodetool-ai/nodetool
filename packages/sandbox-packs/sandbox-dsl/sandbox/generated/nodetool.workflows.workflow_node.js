// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function workflow(inputs, options) {
  return createNode("nodetool.workflows.workflow_node.Workflow", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "single", "source": "__execution__" } } });
}
export {
  workflow
};
