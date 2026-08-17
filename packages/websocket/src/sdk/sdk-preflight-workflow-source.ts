import { Workflow } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { SdkV1AuthorizedWorkflowSource } from "./sdk-preflight-orchestrator.js";
import { deriveWorkflowInterfaceSourceV1 } from "../workflow-interface-service.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

interface CreateNodeToolSdkV1WorkflowSourceOptions {
  registry: NodeRegistry;
  /**
   * Injectable for focused tests. Production uses Workflow.find, which
   * enforces owner/public/collaborator read access.
   */
  findAuthorizedWorkflow?: (
    userId: string,
    workflowId: string
  ) => Promise<Workflow | null>;
}

/**
 * Adapts NodeTool's existing authorized workflow read and graph-derived
 * interface implementation to the transport-neutral preflight boundary.
 */
export function createNodeToolSdkV1WorkflowSource(
  options: CreateNodeToolSdkV1WorkflowSourceOptions
): SdkV1AuthorizedWorkflowSource {
  const findAuthorizedWorkflow =
    options.findAuthorizedWorkflow ??
    ((userId: string, workflowId: string) => Workflow.find(userId, workflowId));

  return {
    async loadAuthorizedWorkflow(input) {
      const workflow = await findAuthorizedWorkflow(
        input.principal.userId,
        input.workflowId
      );
      if (!workflow) return null;
      if (
        input.workspaceId !== null &&
        workflow.workspace_id !== input.workspaceId
      ) {
        return null;
      }
      const source = deriveWorkflowInterfaceSourceV1({
        workflow,
        registry: options.registry
      });
      return {
        workflowInterface: source.workflowInterface,
        graph: {
          nodes: (source.graph.nodes ?? []).map((node) => ({
            id: node.id,
            type: node.type,
            properties: isRecord(node.properties) ? node.properties : undefined,
            data: isRecord(node.data) ? node.data : undefined,
            dynamic_outputs: node.dynamic_outputs
          })),
          edges: source.graph.edges ?? []
        }
      };
    }
  };
}
