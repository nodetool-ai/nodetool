/**
 * The server's agent-toolbelt host deps: the shared builder, bound to this
 * process's run environment and its project delete.
 */
import { mcpToolHostDeps as sharedMcpToolHostDeps } from "@nodetool-ai/project-services/mcp-tool-host-deps";
import {
  getWorkflowRuntimeEnvironment,
  type HttpApiOptions
} from "./http-api.js";
import { deleteProjectForUser } from "./lib/project-delete.js";

export { createExampleWorkflowCatalog } from "@nodetool-ai/project-services/mcp-tool-host-deps";

export function mcpToolHostDeps(
  options: HttpApiOptions = {}
): ReturnType<typeof sharedMcpToolHostDeps> {
  return sharedMcpToolHostDeps({
    ...options,
    workflowEnvironment: () => getWorkflowRuntimeEnvironment(options),
    deleteProject: deleteProjectForUser
  });
}
