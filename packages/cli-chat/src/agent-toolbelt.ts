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
import { buildFullRegistry } from "@nodetool-ai/cli-execution/node-registry";
import { mcpToolHostDeps } from "@nodetool-ai/project-services/mcp-tool-host-deps";
import {
  createWorkflowRuntimeEnvironment,
  type WorkflowRuntimeEnvironment
} from "@nodetool-ai/project-services/workflow-runtime-environment";

let runtimeEnvironment: Promise<WorkflowRuntimeEnvironment> | null = null;

/** One run environment per process, over the first registry a belt brings. */
function workflowEnvironment(
  registry: NodeRegistry | undefined
): () => Promise<WorkflowRuntimeEnvironment> {
  return () =>
    (runtimeEnvironment ??= createWorkflowRuntimeEnvironment(async () =>
      registry ?? buildFullRegistry()
    ));
}

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
    ...getAllMcpTools({
      providers,
      registry,
      ...mcpToolHostDeps({ workflowEnvironment: workflowEnvironment(registry) })
    }),
    toolForCapabilityName("list_collections"),
    toolForCapabilityName("query_collection")
  ]) {
    if (!byName.has(tool.name)) byName.set(tool.name, tool);
  }
  return [...byName.values()];
}
