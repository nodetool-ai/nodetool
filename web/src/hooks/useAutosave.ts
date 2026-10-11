import { Node, Edge } from "../stores/ApiTypes";
import { trpcClient } from "../trpc/client";

/** The workflow row's concurrency tokens after an autosave or checkpoint. */
export interface AutosaveResult {
  updatedAt: string;
  etag?: string;
  /** True when the server's rate limit skipped the write. */
  skipped: boolean;
}

export async function triggerAutosaveForWorkflow(
  workflowId: string,
  graph: { nodes: unknown[]; edges: unknown[] },
  saveType: "autosave" | "checkpoint" = "autosave",
  options?: {
    description?: string;
    force?: boolean;
    maxVersions?: number;
    expectedUpdatedAt?: string;
  }
): Promise<AutosaveResult | null> {
  try {
    const result = await trpcClient.workflows.autosave.mutate({
      id: workflowId,
      save_type: saveType,
      description: options?.description,
      force: options?.force ?? false,
      client_id: "system",
      graph: graph as { nodes: Node[]; edges: Edge[] },
      max_versions: options?.maxVersions ?? 50,
      expected_updated_at: options?.expectedUpdatedAt
    });
    if (!result.updated_at) {
      return null;
    }
    return {
      updatedAt: result.updated_at,
      etag: result.etag ?? undefined,
      skipped: result.skipped
    };
  } catch (error) {
    console.error(`Autosave (${saveType}) failed:`, error);
    return null;
  }
}
