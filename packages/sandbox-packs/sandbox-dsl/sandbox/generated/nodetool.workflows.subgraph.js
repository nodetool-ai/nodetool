// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function subgraph(inputs, options) {
  return createNode("nodetool.workflows.subgraph.Subgraph", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true, inputMode: "buffered", outputCorrelation: { "output": { "kind": "single", "source": "__execution__" } } });
}
export {
  subgraph
};
