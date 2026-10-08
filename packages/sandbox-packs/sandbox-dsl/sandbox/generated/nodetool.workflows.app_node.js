// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function app(inputs, options) {
  return createNode("nodetool.workflows.app_node.App", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true, inputMode: "buffered" });
}
export {
  app
};
