// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function subgraph(inputs) {
  return createNode("nodetool.workflows.subgraph.Subgraph", inputs, { outputNames: [], streaming: true });
}
export {
  subgraph
};
