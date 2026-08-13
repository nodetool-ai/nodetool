/**
 * The toolbelt a Code node and a JS script share.
 *
 * Same assembly as an agent loop's server half: `getAgentToolbelt()` plus the
 * in-process MCP tools that only need the process node registry. The example
 * catalog, DSL exporter, and provider map live above this package, so those
 * tools stay dark and `nodetool.capabilities()` reports the difference.
 *
 * Chat CodeAct can also carry client `ui_*` tools. Those need a browser, so
 * they are not on this belt.
 */
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Tool } from "./tools/base-tool.js";
import { getAgentToolbelt } from "./tools/builtin-tools.js";
import { getAllMcpTools } from "./tools/mcp-tools.js";
import {
  buildToolBridge,
  TOOLS_PRELUDE
} from "./codeact/tool-api.js";
import { NODETOOL_API_PRELUDE_FULL } from "./codeact/nodetool-api.js";

export const NODETOOL_PRELUDE = `${TOOLS_PRELUDE}\n${NODETOOL_API_PRELUDE_FULL}`;

export function assembleSandboxToolbelt(): Tool[] {
  const byName = new Map<string, Tool>();
  for (const tool of [
    ...getAgentToolbelt(),
    ...getAllMcpTools({ registry: NodeRegistry.global })
  ]) {
    byName.set(tool.name, tool);
  }
  return [...byName.values()];
}

export function sandboxToolBridgeGlobals(
  context: ProcessingContext,
  tools: Tool[] = assembleSandboxToolbelt()
): Record<string, unknown> {
  return buildToolBridge({ tools, context }).globals;
}
