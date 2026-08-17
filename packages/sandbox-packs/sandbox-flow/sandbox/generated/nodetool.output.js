// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function output(inputs) {
  return callNode("nodetool.output.Output", inputs);
}
output.stream = function(inputs) {
  return streamNode("nodetool.output.Output", inputs);
};
export {
  output
};
