import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";

/**
 * How many documents the project on screen holds, or null until it is known.
 * Same query as `CurrentProjectDocuments` (first page, same inputs), so the
 * two share one cached request.
 */
export const useProjectDocumentTotal = (): number | null => {
  const activeProjectId = useWorkspaceTabsStore(
    (state) => state.activeProjectId
  );
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const projectId =
    activeProjectId && activeProjectId !== LOOSE_PROJECT_ID
      ? activeProjectId
      : personalProjectId;
  const { data } = trpc.projects.documentPage.useQuery(
    { id: projectId ?? "", offset: 0, limit: 4 },
    {
      enabled: Boolean(projectId),
      staleTime: 15_000,
      trpc: { context: { skipBatch: true } }
    }
  );
  return data ? data.total : null;
};
