// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode, streamNode } from "../guest-core.js";
function app(inputs) {
  return callNode("nodetool.workflows.app_node.App", inputs);
}
app.stream = function(inputs) {
  return streamNode("nodetool.workflows.app_node.App", inputs);
};
export {
  app
};
