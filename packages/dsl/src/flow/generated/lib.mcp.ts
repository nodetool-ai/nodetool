// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";

// Call MCP Tool — lib.mcp.CallMcpTool
export type CallMcpToolInputs = {
  server?: string;
  tool?: string;
  input_schema?: Record<string, unknown>;
};

export interface CallMcpToolOutputs {
  text: string;
  result: unknown;
  resource_links: Record<string, unknown>[];
}

export function callMcpTool(inputs: CallMcpToolInputs): Promise<CallMcpToolOutputs> {
  return callNode<CallMcpToolOutputs>("lib.mcp.CallMcpTool", inputs);
}
