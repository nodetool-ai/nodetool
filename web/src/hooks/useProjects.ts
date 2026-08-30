/**
 * tRPC hooks for projects, plus the one action that spans the store and the
 * server: opening a project restores its documents as tabs, and only the
 * server knows which documents those are.
 */

import { useCallback } from "react";

import { trpc, trpcClient } from "../trpc/client";
import {
  PROJECT_NEW_REF,
  useWorkspaceTabsStore,
  type ProjectTabDocument
} from "../stores/WorkspaceTabsStore";

/**
 * Open the surface a project is started from. One tab, so every entry point —
 * the `+ New` menu, the list's ghost card, its header button — lands on the
 * same one rather than stacking copies.
 */
export const useOpenNewProjectTab = () => {
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  return useCallback(
    () =>
      openTab({
        type: "project-new",
        ref: PROJECT_NEW_REF,
        mode: "view",
        title: "New project"
      }),
    [openTab]
  );
};

export const useProjects = () =>
  trpc.projects.list.useQuery({}, { staleTime: 30_000 });

/** Every project with the status and spend its card shows. */
export const useProjectSummaries = () =>
  trpc.projects.summaries.useQuery({}, { staleTime: 15_000 });

/** Documents in no project — the list's "Not in a project" strip. */
export const useUnassignedDocuments = () =>
  trpc.projects.unassigned.useQuery({}, { staleTime: 15_000 });

const useInvalidateProjects = () => {
  const utils = trpc.useUtils();
  return useCallback(() => {
    void utils.projects.list.invalidate();
    void utils.projects.summaries.invalidate();
    void utils.projects.unassigned.invalidate();
  }, [utils]);
};

export const useCreateProject = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.create.useMutation({ onSuccess: invalidate });
};

export const useAssignDocument = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.assignDocument.useMutation({ onSuccess: invalidate });
};

/**
 * Open a project as a tab group: its overview plus one tab per document it
 * holds. The documents are fetched rather than read from a query cache so a
 * project opened from anywhere restores the same set.
 */
export const useOpenProject = () => {
  const openProject = useWorkspaceTabsStore((state) => state.openProject);
  return useCallback(
    async (project: { id: string; name: string }) => {
      const documents = await trpcClient.projects.documents.query({
        id: project.id
      });
      openProject({
        id: project.id,
        name: project.name,
        documents: documents.map(
          (doc): ProjectTabDocument => ({
            type: doc.type,
            ref: doc.ref,
            title: doc.name
          })
        )
      });
    },
    [openProject]
  );
};
