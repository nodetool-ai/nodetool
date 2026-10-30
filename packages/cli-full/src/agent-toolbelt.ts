/**
 * The CLI's default agent toolbelt: the belt a server chat turn assembles in
 * `packages/websocket/src/session/chat-turn.ts`, so a local turn reaches the
 * same tools. `buildFullRegistry` also installs the sandbox pack catalog, so
 * the session allowlist can admit the DSL, flow, Fabric and timeline packs.
 *
 * The server additionally offers `run_node`, the user's external MCP servers
 * and Google Workspace. Those are built from server-only state.
 */

import type { BaseProvider } from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  getAllMcpTools,
  getApifyTools,
  getBuiltinTools,
  getSerpApiTools,
  toolForCapabilityName,
  type Tool
} from "@nodetool-ai/agents";
import { mcpToolHostDeps } from "@nodetool-ai/websocket";

/** Every default tool, de-duplicated by name with the first one winning. */
export function buildCliToolbelt(
  providers: Record<string, BaseProvider>,
  registry?: NodeRegistry
): Tool[] {
  const byName = new Map<string, Tool>();
  for (const tool of [
    ...getBuiltinTools(),
    ...getApifyTools(),
    ...getSerpApiTools(),
    ...getAllMcpTools({ providers, registry, ...mcpToolHostDeps() }),
    toolForCapabilityName("list_collections"),
    toolForCapabilityName("query_collection")
  ]) {
    if (!byName.has(tool.name)) byName.set(tool.name, tool);
  }
  return [...byName.values()];
}
