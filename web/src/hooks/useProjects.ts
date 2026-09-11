/**
 * tRPC hooks for projects, plus session restoration across the persisted tab
 * store and server-side resource ownership checks.
 */

import { useCallback } from "react";

import { trpc, trpcClient } from "../trpc/client";
import {
  PROJECT_NEW_REF,
  useWorkspaceTabsStore,
  type ProjectTabDocument,
  type WorkspaceTab,
  type WorkspaceTabType
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

/** Archived projects are deliberately separate from the normal selector list. */
export const useArchivedProjects = () =>
  trpc.projects.archived.useQuery({}, { staleTime: 30_000 });

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
    void utils.projects.archived.invalidate();
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

export const useAssignDocument = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.assignDocument.useMutation({ onSuccess: invalidate });
};

export const useArchiveProject = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.archive.useMutation({ onSuccess: invalidate });
};

export const useRestoreProject = () => {
  const invalidate = useInvalidateProjects();
  return trpc.projects.restore.useMutation({ onSuccess: invalidate });
};

export const useDeleteProject = () => {
  const invalidate = useInvalidateProjects();
  const closeProject = useWorkspaceTabsStore((state) => state.closeProject);
  return trpc.projects.delete.useMutation({
    onSuccess: (_result, variables) => {
      closeProject(variables.id);
      invalidate();
    }
  });
};

/**
 * Most recently *requested* project id, shared across every `useOpenProject`
 * instance. Two components (the list surface, the scope chip) each mount
 * their own instance of the hook, so the guard has to live at module scope
 * rather than per-instance — otherwise a click through one component can't
 * see a later click through the other, and both resolutions would fire.
 */
let latestRequestedId: string | null = null;

type RestorableTabType = Exclude<
  WorkspaceTabType,
  "skill" | "page" | "project-list" | "project" | "project-new"
>;

const isRestorableType = (
  type: WorkspaceTabType
): type is RestorableTabType => {
  switch (type) {
    case "workflow":
    case "image":
    case "svg":
    case "sketch":
    case "timeline":
    case "storyboard":
    case "script":
    case "jsscript":
    case "audio":
    case "text":
    case "model3d":
    case "application":
    case "chat":
    case "workspace-file":
      return true;
    default:
      return false;
  }
};

/**
 * Open a project from its persisted session. The server's document inventory
 * is not a navigation session: using it here reopened deliberately closed
 * documents and discarded tab types the inventory does not contain.
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
      const state = useWorkspaceTabsStore.getState();
      const session = state.projectSessions[project.id];
      const savedTabs = session
        ? session.tabIds
            .map((id) => state.tabs.find((tab) => tab.id === id))
            .filter(
              (tab): tab is WorkspaceTab & { type: RestorableTabType } =>
                tab !== undefined && isRestorableType(tab.type)
            )
            .map((tab) => ({
              type: tab.type,
              ref: tab.ref,
              title: tab.title
            }))
        : [];
      try {
        const documents: ProjectTabDocument[] | undefined = session
          ? await trpcClient.projects.restoreTabs.query({
              id: project.id,
              tabs: savedTabs
            })
          : undefined;
        if (latestRequestedId !== project.id) return false;
        openProject({ ...project, documents });
        return true;
      } catch (error) {
        if (latestRequestedId !== project.id) return false;
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
    [addNotification, openProject]
  );
};
