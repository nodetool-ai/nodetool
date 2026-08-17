// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function code(inputs) {
  return callNode("nodetool.code.Code", inputs);
}
code.stream = function(inputs) {
  return streamNode("nodetool.code.Code", inputs);
};
export {
  code
};
