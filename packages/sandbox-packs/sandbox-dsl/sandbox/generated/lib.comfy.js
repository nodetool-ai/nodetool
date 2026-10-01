// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function runWorkflow(inputs, options) {
  return createNode("lib.comfy.RunWorkflow", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "dict[str, any]" }, defaultOutput: "output", streaming: true });
}
function runWorkflowOnWorker(inputs, options) {
  return createNode("lib.comfy.RunWorkflowOnWorker", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "dict[str, any]" }, defaultOutput: "output", streaming: true });
}
function runWorkflowOnCloud(inputs, options) {
  return createNode("lib.comfy.RunWorkflowOnCloud", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "dict[str, any]" }, defaultOutput: "output", streaming: true });
}
export {
  runWorkflow,
  runWorkflowOnCloud,
  runWorkflowOnWorker
};
