// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function setVariable(inputs) {
  return createNode("nodetool.variable.SetVariable", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
function getVariable(inputs) {
  return createNode("nodetool.variable.GetVariable", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
export {
  getVariable,
  setVariable
};
