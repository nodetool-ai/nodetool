// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { callNode } from "../guest-core.js";
function callMcpTool(inputs) {
  return callNode("lib.mcp.CallMcpTool", inputs);
}
export {
  callMcpTool
};
