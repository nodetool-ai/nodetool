import { createWorkspace } from "@nodetool-ai/runtime";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import type { ProjectWorkspaceResolution } from "../../src/service/workflow-workspace.js";

/**
 * A `resolveWorkspace` for runs whose test does not look at files: every run
 * gets a fresh in-memory project folder.
 */
export async function memoryFolder(
  projectId: string | null
): Promise<ProjectWorkspaceResolution> {
  return {
    ok: true,
    projectId: projectId ?? "",
    workspace: createWorkspace(new InMemoryStorageAdapter())
  };
}
