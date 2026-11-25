// Built from @nodetool-ai/dsl by scripts/build.mjs — do not edit
import { createNode } from "../core.js";
function callMcpTool(inputs, options) {
  return createNode("lib.mcp.CallMcpTool", inputs, { id: options?.id, outputNames: ["text", "result", "resource_links"], outputTypes: { "text": "str", "result": "any", "resource_links": "list[dict[str, any]]" } });
}
export {
  callMcpTool
};
