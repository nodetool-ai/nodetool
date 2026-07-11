import { Node, Edge } from "../stores/ApiTypes";
import { trpcClient } from "../trpc/client";

export async function triggerAutosaveForWorkflow(
  workflowId: string,
  graph: { nodes: unknown[]; edges: unknown[] },
  saveType: "autosave" | "checkpoint" = "autosave",
  options?: { description?: string; force?: boolean; maxVersions?: number }
): Promise<void> {
  try {
    await trpcClient.workflows.autosave.mutate({
      id: workflowId,
      save_type: saveType,
      description: options?.description,
      force: options?.force ?? false,
      client_id: "system",
      graph: graph as { nodes: Node[]; edges: Edge[] },
      max_versions: options?.maxVersions ?? 50
    });
  } catch (error) {
    console.error(`Autosave (${saveType}) failed:`, error);
  }
}
