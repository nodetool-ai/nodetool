// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function output(inputs) {
  return createNode("nodetool.output.Output", inputs, { outputNames: ["output"], defaultOutput: "output", streaming: true });
}
export {
  output
};
