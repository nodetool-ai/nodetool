// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function runWorkflow(inputs) {
  return createNode("lib.comfy.RunWorkflow", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
function runWorkflowOnWorker(inputs) {
  return createNode("lib.comfy.RunWorkflowOnWorker", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
export {
  runWorkflow,
  runWorkflowOnWorker
};
