// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function setVariable(inputs) {
  return callNode("nodetool.variable.SetVariable", inputs);
}
function getVariable(inputs) {
  return callNode("nodetool.variable.GetVariable", inputs);
}
getVariable.stream = function(inputs) {
  return streamNode("nodetool.variable.GetVariable", inputs);
};
export {
  getVariable,
  setVariable
};
