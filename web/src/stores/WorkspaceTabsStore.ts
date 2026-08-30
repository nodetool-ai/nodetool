// WorkspaceTabsStore.ts
// -----------------------------------------------------------------
// The unified tab registry for the tabbed-document workspace.
//
// A workspace tab is a `(type, ref)` document opened in a `mode`
// (view | edit). This store owns ONLY the tab list, the active tab,
// and each tab's mode — the navigation state. Document *content*
// stays in its existing store (WorkflowManagerStore for workflows,
// SketchSessionStore for sketches, asset queries for media, …), keyed
// by `ref`. Opening/closing a tab coordinates with those stores at the
// call site, not here, so this store stays pure and testable.
// -----------------------------------------------------------------

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceTabType =
  | "workflow"
  | "image"
  | "sketch"
  | "timeline"
  | "storyboard"
  | "script"
  // JS script documents. `ref` is a js_scripts id (trpc.jsScripts.*).
  | "jsscript"
  | "skill"
  | "model3d"
  | "audio"
  | "text"
  // Mini apps. `ref` is an application id (trpc.applications.*).
  | "application"
  // Chat conversations. `ref` is a chat thread id (GlobalChatStore).
  | "chat"
  // Files inside a run workspace. `ref` is `${workspaceId}::${path}` — see
  // components/workspace/workspaceFileRef.ts.
  | "workspace-file"
  // App pages (Settings, Costs, Model Manager, …) opened from the logo menu.
  // `ref` is a PageTabKey; these have no edit mode.
  | "page"
  // The projects list. One per workspace — `ref` is the constant below.
  | "project-list"
  // A project's overview. `ref` is a project id (trpc.projects.*).
  | "project"
  // The surface a project is started from. One per workspace — `ref` is the
  // constant below, and the tab closes once the project it described exists.
  | "project-new";

export type WorkspaceTabMode = "view" | "edit";

export interface WorkspaceTab {
  /** Stable id, `${type}:${ref}` — one tab per document. */
  id: string;
  type: WorkspaceTabType;
  /** Document id: workflowId, sequenceId, assetId, sketchDocumentId, … */
  ref: string;
  mode: WorkspaceTabMode;
  title: string;
  /**
   * The project this tab belongs to, when it belongs to one. Tabs sharing the
   * active project render as one group in the tab bar. Absent means loose —
   * the {@link LOOSE_PROJECT_ID} bucket is spelled as absence here, so a tab
   * never claims membership in a project that does not exist.
   */
  projectId?: string;
}

interface OpenTabInput {
  type: WorkspaceTabType;
  ref: string;
  /**
   * New tabs default to "edit". For an existing tab the mode is only
   * updated when one is explicitly given.
   */
  mode?: WorkspaceTabMode;
  title?: string;
  /**
   * The project the document belongs to. `LOOSE_PROJECT_ID` reads as no
   * project, so a creation site can pass {@link creationProjectId} straight
   * through. Omitted leaves an existing tab's project alone.
   */
  projectId?: string;
}

/** A document to restore as a tab when its project opens. */
export interface ProjectTabDocument {
  type: WorkspaceTabType;
  ref: string;
  title: string;
}

export interface OpenProjectInput {
  id: string;
  name: string;
  documents?: readonly ProjectTabDocument[];
}

interface WorkspaceTabsState {
  /**
   * The tabs, in the order the bar renders them: the active project's tabs are
   * always one contiguous run. See {@link gatherProjectTabs}.
   */
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  /**
   * The project new documents are created into. Null means none is open, and
   * a creation then lands in the loose bucket ({@link LOOSE_PROJECT_ID}).
   */
  activeProjectId: string | null;

  /**
   * Open a document tab. If a tab for the same `(type, ref)` already
   * exists it is focused (and its mode updated when one is given) rather
   * than duplicated. Returns the tab id.
   */
  openTab: (input: OpenTabInput) => string;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  setActiveTab: (id: string) => void;
  setMode: (id: string, mode: WorkspaceTabMode) => void;
  toggleMode: (id: string) => void;
  setTitle: (ref: string, type: WorkspaceTabType, title: string) => void;
  moveTab: (id: string, toIndex: number) => void;
  getActiveTab: () => WorkspaceTab | null;
  setActiveProjectId: (projectId: string | null) => void;
  /**
   * Make `input.id` the active project: open its overview tab, adopt or open a
   * tab per document, and gather the group into one contiguous run. Documents
   * come from the caller because the store holds no server state.
   */
  openProject: (input: OpenProjectInput) => void;
  /** Close every tab belonging to a project, and leave it if it was active. */
  closeProject: (projectId: string) => void;
}

/** The project id documents carry when no project is open. */
export const LOOSE_PROJECT_ID = "default";

/** The projects list is one tab, so its `ref` is a constant. */
export const PROJECT_LIST_REF = "projects";

/** The new-project surface is one tab, so its `ref` is a constant too. */
export const PROJECT_NEW_REF = "new";

export const tabId = (type: WorkspaceTabType, ref: string): string =>
  `${type}:${ref}`;

/** A tab's project, with the loose bucket read as no project. */
const projectOf = (projectId: string | undefined): string | undefined =>
  projectId && projectId !== LOOSE_PROJECT_ID ? projectId : undefined;

/**
 * The active project, unless closing tabs left none of it open. A project
 * nothing on screen belongs to must not keep catching new documents.
 */
const stillOpen = (
  tabs: WorkspaceTab[],
  activeProjectId: string | null
): string | null =>
  activeProjectId && tabs.some((t) => t.projectId === activeProjectId)
    ? activeProjectId
    : null;

/**
 * The store's tab order, canonicalized: the active project's tabs gathered
 * into one contiguous run, at the position of the first of them. Every other
 * tab keeps its place.
 *
 * This is the store invariant, not a view transform — `tabs` is what the bar
 * renders, so a tab's index in `tabs` is its index on screen and drag-and-drop
 * and close-focus arithmetic need no translation. Every action that can break
 * contiguity (opening a tab, moving one, switching project scope) runs its
 * result through this.
 *
 * Returns the input array unchanged when the order already holds, so an action
 * that reorders nothing does not churn subscribers.
 */
export const gatherProjectTabs = (
  tabs: WorkspaceTab[],
  activeProjectId: string | null
): WorkspaceTab[] => {
  if (!activeProjectId) {
    return tabs;
  }
  const grouped = tabs.filter((t) => t.projectId === activeProjectId);
  if (grouped.length < 2) {
    return tabs;
  }
  const rest = tabs.filter((t) => t.projectId !== activeProjectId);
  // Everything before the first group member is loose, so its index is also
  // how many loose tabs precede the group.
  const head = tabs.findIndex((t) => t.projectId === activeProjectId);
  const gathered = [...rest.slice(0, head), ...grouped, ...rest.slice(head)];
  return gathered.every((t, i) => t === tabs[i]) ? tabs : gathered;
};

/**
 * The index `moveTab` must be given to drop `sourceId` on the `position` side
 * of `targetId`. Null when either tab is gone or the drop is a no-op.
 *
 * Indices are store indices, which are also screen indices — see
 * {@link gatherProjectTabs}.
 */
export const dropTargetIndex = (
  tabs: WorkspaceTab[],
  sourceId: string,
  targetId: string,
  position: "left" | "right"
): number | null => {
  if (sourceId === targetId) {
    return null;
  }
  const sourceIndex = tabs.findIndex((t) => t.id === sourceId);
  const targetIndex = tabs.findIndex((t) => t.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) {
    return null;
  }
  const insertAt = position === "right" ? targetIndex + 1 : targetIndex;
  return sourceIndex < insertAt ? insertAt - 1 : insertAt;
};

/**
 * Pick the tab that should become active after `closingId` is removed: the tab
 * to the right, else the tab to the left, else null. `tabs` is in store order,
 * which is screen order, so the neighbour is the visible one.
 */
export const nextActiveAfterClose = (
  tabs: WorkspaceTab[],
  activeTabId: string | null,
  closingId: string
): string | null => {
  if (activeTabId !== closingId) {
    return activeTabId;
  }
  const index = tabs.findIndex((t) => t.id === closingId);
  if (index === -1) {
    return activeTabId;
  }
  const next = tabs[index + 1] ?? tabs[index - 1];
  return next ? next.id : null;
};

const clampIndex = (index: number, length: number): number =>
  Math.max(0, Math.min(index, length - 1));

// -----------------------------------------------------------------
// Legacy seeding — adopt workflows the user already had open so the
// upgrade to the workspace shell never drops their tabs.
// -----------------------------------------------------------------

const readLegacyOpenWorkflows = (): string[] => {
  try {
    const raw = localStorage.getItem("openWorkflows");
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
};

export const seedTabsFromLegacy = (): Pick<
  WorkspaceTabsState,
  "tabs" | "activeTabId"
> => {
  const workflowIds = readLegacyOpenWorkflows();
  const tabs: WorkspaceTab[] = workflowIds.map((ref) => ({
    id: tabId("workflow", ref),
    type: "workflow",
    ref,
    mode: "edit",
    title: "Loading…"
  }));

  let activeTabId: string | null = tabs.length > 0 ? tabs[0].id : null;
  try {
    const currentWorkflowId = localStorage.getItem("currentWorkflowId");
    if (currentWorkflowId) {
      const seededId = tabId("workflow", currentWorkflowId);
      if (tabs.some((t) => t.id === seededId)) {
        activeTabId = seededId;
      }
    }
  } catch {
    // Ignore storage failures; fall back to the first tab.
  }

  return { tabs, activeTabId };
};

export const useWorkspaceTabsStore = create<WorkspaceTabsState>()(
  persist(
    (set, get) => ({
      ...seedTabsFromLegacy(),
      activeProjectId: null,

      openTab: ({ type, ref, mode, title, projectId }) => {
        const id = tabId(type, ref);
        const project = projectOf(projectId);
        const existing = get().tabs.find((t) => t.id === id);
        if (existing) {
          set((state) => ({
            activeTabId: id,
            tabs: gatherProjectTabs(
              state.tabs.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      mode: mode ?? t.mode,
                      title: title ?? t.title,
                      projectId: projectId === undefined ? t.projectId : project
                    }
                  : t
              ),
              state.activeProjectId
            )
          }));
          return id;
        }
        const tab: WorkspaceTab = {
          id,
          type,
          ref,
          mode: mode ?? "edit",
          title: title ?? "Untitled"
        };
        if (project) {
          tab.projectId = project;
        }
        set((state) => ({
          tabs: gatherProjectTabs([...state.tabs, tab], state.activeProjectId),
          activeTabId: id
        }));
        return id;
      },

      closeTab: (id) =>
        set((state) => {
          const tabs = state.tabs.filter((t) => t.id !== id);
          const activeProjectId = stillOpen(tabs, state.activeProjectId);
          return {
            tabs: gatherProjectTabs(tabs, activeProjectId),
            activeTabId: nextActiveAfterClose(state.tabs, state.activeTabId, id),
            activeProjectId
          };
        }),

      closeOthers: (id) =>
        set((state) => {
          const kept = state.tabs.filter((t) => t.id === id);
          return {
            tabs: kept,
            activeTabId: kept.length > 0 ? id : null,
            activeProjectId: stillOpen(kept, state.activeProjectId)
          };
        }),

      // Activating a tab that belongs to a project switches the scope to it;
      // a loose tab leaves the open project alone, so reading a scratch note
      // does not close the group the user is working in.
      setActiveTab: (id) =>
        set((state) => {
          const project = state.tabs.find((t) => t.id === id)?.projectId;
          const activeProjectId = project ?? state.activeProjectId;
          return {
            activeTabId: id,
            activeProjectId,
            tabs: gatherProjectTabs(state.tabs, activeProjectId)
          };
        }),

      setMode: (id, mode) =>
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, mode } : t))
        })),

      toggleMode: (id) =>
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === id
              ? { ...t, mode: t.mode === "edit" ? "view" : "edit" }
              : t
          )
        })),

      setTitle: (ref, type, title) =>
        set((state) => {
          const id = tabId(type, ref);
          const existing = state.tabs.find((t) => t.id === id);
          if (!existing || existing.title === title) return state;
          return {
            tabs: state.tabs.map((t) =>
              t.id === id ? { ...t, title } : t
            )
          };
        }),

      moveTab: (id, toIndex) =>
        set((state) => {
          const from = state.tabs.findIndex((t) => t.id === id);
          if (from === -1) {
            return state;
          }
          const tabs = [...state.tabs];
          const [moved] = tabs.splice(from, 1);
          tabs.splice(clampIndex(toIndex, tabs.length + 1), 0, moved);
          // A drop that would break the group is pulled back to the nearest
          // order that keeps it contiguous — the bar can show no other.
          return { tabs: gatherProjectTabs(tabs, state.activeProjectId) };
        }),

      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId) ?? null;
      },

      setActiveProjectId: (projectId) =>
        set((state) => ({
          activeProjectId: projectId,
          tabs: gatherProjectTabs(state.tabs, projectId)
        })),

      openProject: ({ id, name, documents = [] }) =>
        set((state) => {
          const overview: WorkspaceTab = {
            id: tabId("project", id),
            type: "project",
            ref: id,
            mode: "view",
            title: name,
            projectId: id
          };
          const wanted: WorkspaceTab[] = [
            overview,
            ...documents.map((doc) => {
              const existing = state.tabs.find(
                (t) => t.id === tabId(doc.type, doc.ref)
              );
              return {
                id: tabId(doc.type, doc.ref),
                type: doc.type,
                ref: doc.ref,
                mode: existing?.mode ?? "edit",
                title: doc.title,
                projectId: id
              } satisfies WorkspaceTab;
            })
          ];
          const wantedIds = new Set(wanted.map((t) => t.id));
          const others = state.tabs.filter((t) => !wantedIds.has(t.id));
          // The group lands where its first member already sat, so opening a
          // project the user has tabs from does not reshuffle the bar.
          const at = state.tabs.findIndex((t) => wantedIds.has(t.id));
          const head = at === -1 ? others.length : Math.min(at, others.length);
          return {
            // Gather again: a tab already carrying this project id but absent
            // from `documents` (deleted server-side, past the per-type cap)
            // sits in `others` and would otherwise split the group.
            tabs: gatherProjectTabs(
              [...others.slice(0, head), ...wanted, ...others.slice(head)],
              id
            ),
            activeTabId: overview.id,
            activeProjectId: id
          };
        }),

      closeProject: (projectId) =>
        set((state) => {
          const tabs = state.tabs.filter((t) => t.projectId !== projectId);
          const activeStillOpen = tabs.some((t) => t.id === state.activeTabId);
          // Focus what the group left behind: the tab that slid into its
          // place, else the one just before it. All tabs before `at` survive
          // the filter, so `tabs[at]` is the first survivor past the group's
          // first member — contiguous or not.
          const at = state.tabs.findIndex((t) => t.projectId === projectId);
          const neighbour = tabs[at] ?? tabs[at - 1] ?? tabs[tabs.length - 1];
          const activeProjectId =
            state.activeProjectId === projectId ? null : state.activeProjectId;
          return {
            tabs: gatherProjectTabs(tabs, activeProjectId),
            activeTabId: activeStillOpen
              ? state.activeTabId
              : (neighbour?.id ?? null),
            activeProjectId
          };
        })
    }),
    {
      name: "workspace-tabs-storage",
      version: 1,
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        activeProjectId: state.activeProjectId
      }),
      // State persisted before the store kept its tabs gathered (or edited by
      // hand) is canonicalized on the way in, so the invariant holds from the
      // first render.
      merge: (persisted, current) => {
        // Safety: the persisted blob is whatever `partialize` wrote, and any
        // field it is missing falls back to `current`.
        const merged = {
          ...current,
          ...(persisted as Partial<WorkspaceTabsState> | undefined)
        };
        // A persisted active project whose tabs are all gone must not keep
        // catching new documents invisibly.
        const activeProjectId = stillOpen(
          merged.tabs ?? [],
          merged.activeProjectId ?? null
        );
        return {
          ...merged,
          activeProjectId,
          tabs: gatherProjectTabs(merged.tabs ?? [], activeProjectId)
        };
      }
    }
  )
);

/**
 * The project a newly created document belongs to. Read outside React — every
 * creation site is inside a mutation callback, not a render — so a project
 * opened after the component mounted is still the one that counts.
 */
export const creationProjectId = (): string =>
  useWorkspaceTabsStore.getState().activeProjectId ?? LOOSE_PROJECT_ID;
