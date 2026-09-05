// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function runWorkflow(inputs) {
  return callNode("lib.comfy.RunWorkflow", inputs);
}
runWorkflow.stream = function(inputs) {
  return streamNode("lib.comfy.RunWorkflow", inputs);
};
function runWorkflowOnWorker(inputs) {
  return callNode("lib.comfy.RunWorkflowOnWorker", inputs);
}
function runWorkflowOnCloud(inputs) {
  return callNode("lib.comfy.RunWorkflowOnCloud", inputs);
}
runWorkflowOnCloud.stream = function(inputs) {
  return streamNode("lib.comfy.RunWorkflowOnCloud", inputs);
};
export {
  runWorkflow,
  runWorkflowOnCloud,
  runWorkflowOnWorker
};
