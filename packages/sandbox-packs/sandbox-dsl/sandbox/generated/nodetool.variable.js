// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function setVariable(inputs, options) {
  return createNode("nodetool.variable.SetVariable", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output" });
}
function getVariable(inputs, options) {
  return createNode("nodetool.variable.GetVariable", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, outputCorrelation: { "output": { "kind": "iteration", "source": "__execution__", "group": "channel" } } });
}
export {
  getVariable,
  setVariable
};
