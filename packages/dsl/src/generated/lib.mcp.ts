// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";

// Call MCP Tool — lib.mcp.CallMcpTool
export type CallMcpToolInputs = {
  server?: Connectable<string>;
  tool?: Connectable<string>;
  input_schema?: Connectable<Record<string, unknown>>;
  [name: string]: unknown;
};

export interface CallMcpToolOutputs {
  text: string;
  result: unknown;
  resource_links: Record<string, unknown>[];
}

export function callMcpTool(inputs: CallMcpToolInputs, options?: NodeOptions): NodeWithOutputs<CallMcpToolOutputs> {
  return createNode("lib.mcp.CallMcpTool", inputs, { id: options?.id, outputNames: ["text", "result", "resource_links"], outputTypes: {"text":"str","result":"any","resource_links":"list[dict[str, any]]"} });
}
