// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function code(inputs, options) {
  return createNode("nodetool.code.Code", inputs, { id: options?.id, outputNames: [], outputTypes: {}, streaming: true });
}
export {
  code
};
