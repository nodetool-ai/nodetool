// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function code(inputs) {
  return createNode("nodetool.code.Code", inputs, { outputNames: [], streaming: true });
}
export {
  code
};
