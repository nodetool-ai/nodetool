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
import { useNotificationStore } from "../stores/NotificationStore";

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

export const useInvalidateProjects = () => {
  const utils = trpc.useUtils();
  return useCallback(() => {
    void utils.projects.list.invalidate();
    void utils.projects.summaries.invalidate();
    void utils.projects.unassigned.invalidate();
    // Every id — an open overview tab has no refetch trigger of its own, so a
    // targeted invalidate (rather than this blanket one) would leave it stale.
    void utils.projects.get.invalidate();
  }, [utils]);
};

export const useCreateProject = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.create.useMutation({ onSuccess: invalidate });
};

export const useRenameProject = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.update.useMutation({ onSuccess: invalidate });
};

export const useAssignDocument = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.assignDocument.useMutation({ onSuccess: invalidate });
};

/**
 * Most recently *requested* project id, shared across every `useOpenProject`
 * instance. Two components (the list surface, the scope chip) each mount
 * their own instance of the hook, so the guard has to live at module scope
 * rather than per-instance — otherwise a click through one component can't
 * see a later click through the other, and both resolutions would fire.
 */
let latestRequestedId: string | null = null;

/**
 * Open a project as a tab group: its overview plus one tab per document it
 * holds. The documents are fetched rather than read from a query cache so a
 * project opened from anywhere restores the same set.
 *
 * The fetch is async, so two calls can be in flight together (a fast double
 * click, or A then B before A resolves) — including across two separately
 * mounted callers. `latestRequestedId` tracks the most recently *requested*
 * project; a resolution for any other id is stale and no-ops instead of
 * stealing focus back to it. A failed fetch is caught and reported instead of
 * leaving the project silently unopened.
 *
 * Resolves `true` only when the tab group actually opened. A caller that has
 * already committed something to the project — the new-project surface stages
 * its opening turn — needs to tell "opened" from "reported an error" and from
 * "a newer project was requested since"; the callers that merely navigate
 * ignore the value.
 */
export const useOpenProject = () => {
  const openProject = useWorkspaceTabsStore((state) => state.openProject);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  return useCallback(
    async (project: { id: string; name: string }): Promise<boolean> => {
      latestRequestedId = project.id;
      try {
        const documents = await trpcClient.projects.documents.query({
          id: project.id
        });
        if (latestRequestedId !== project.id) {
          return false;
        }
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
        return true;
      } catch (error) {
        if (latestRequestedId !== project.id) {
          return false;
        }
        addNotification({
          type: "error",
          alert: true,
          content: `Could not open ${project.name}: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
        return false;
      }
    },
    [openProject, addNotification]
  );
};
