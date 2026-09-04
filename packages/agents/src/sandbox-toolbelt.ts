/**
 * The toolbelt a Code node and a JS script share.
 *
 * Same assembly as an agent loop's server half: `getBuiltinTools()` plus the
 * Apify and SerpAPI capabilities, plus the in-process MCP tools that only need
 * the process node registry. The example catalog, DSL exporter, and provider
 * map live above this package, so those tools stay dark and
 * `nodetool.capabilities()` reports the difference.
 *
 * Apify and SerpAPI are here because a body can already reach both by import
 * (`@nodetool-ai/sandbox-nodetool/apify`), which the Code node mounts ungated.
 * Leaving them off the belt meant the two paths disagreed: a chat that ran
 * `tools.run_apify_actor` and then wrote the same call into a Code node got
 * `TypeError: not a function` at run time, with nothing naming the tool. They
 * carry no run source, so each call runs over the invoking context's own
 * ungated run — the same door the import path opens, not a wider one.
 *
 * Chat CodeAct can also carry client `ui_*` tools. Those need a browser, so
 * they are not on this belt.
 */
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Tool } from "./tools/base-tool.js";
import { getBuiltinTools } from "./tools/builtin-tools.js";
import {
  getApifyTools,
  getSerpApiTools
} from "./tools/external-capability-tools.js";
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
    ...getBuiltinTools(),
    ...getApifyTools(),
    ...getSerpApiTools(),
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
