// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function output(inputs, options) {
  return createNode("nodetool.output.Output", inputs, { id: options?.id, outputNames: ["output"], outputTypes: { "output": "any" }, defaultOutput: "output", streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "forward", "source": "value" } } });
}
export {
  output
};
