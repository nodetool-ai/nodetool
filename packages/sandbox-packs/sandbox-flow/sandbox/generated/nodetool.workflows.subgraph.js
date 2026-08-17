// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function subgraph(inputs) {
  return callNode("nodetool.workflows.subgraph.Subgraph", inputs);
}
subgraph.stream = function(inputs) {
  return streamNode("nodetool.workflows.subgraph.Subgraph", inputs);
};
export {
  subgraph
};
