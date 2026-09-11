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
  // SVG assets. `ref` is an asset id; the surface previews the vector and
  // edits its markup, which is why it is not an `image` tab.
  | "svg"
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

export interface ProjectSession {
  /** The tabs shown by this project, in tab-bar order. */
  tabIds: string[];
  /** The document restored when this project is selected again. */
  activeTabId: string | null;
  /** The last chat selected from this project's session. */
  selectedChatThreadId: string | null;
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
  /** Independent navigation state for each project, including Personal. */
  projectSessions: Record<string, ProjectSession>;

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

const sessionKey = (projectId: string | undefined): string =>
  projectId ?? LOOSE_PROJECT_ID;

const emptySession = (): ProjectSession => ({
  tabIds: [],
  activeTabId: null,
  selectedChatThreadId: null
});

const sessionFor = (
  sessions: Record<string, ProjectSession>,
  projectId: string | undefined
): ProjectSession => sessions[sessionKey(projectId)] ?? emptySession();

const sessionFromTabs = (
  tabs: WorkspaceTab[],
  activeTabId: string | null
): Record<string, ProjectSession> => {
  const sessions: Record<string, ProjectSession> = {};
  for (const tab of tabs) {
    const key = sessionKey(tab.projectId);
    const session = sessions[key] ?? emptySession();
    sessions[key] = { ...session, tabIds: [...session.tabIds, tab.id] };
  }
  for (const [key, session] of Object.entries(sessions)) {
    const active = session.tabIds.includes(activeTabId ?? "")
      ? activeTabId
      : session.tabIds[0] ?? null;
    sessions[key] = { ...session, activeTabId: active };
  }
  return sessions;
};

const updateSession = (
  sessions: Record<string, ProjectSession>,
  projectId: string | undefined,
  update: (session: ProjectSession) => ProjectSession
): Record<string, ProjectSession> => {
  const key = sessionKey(projectId);
  return { ...sessions, [key]: update(sessionFor(sessions, projectId)) };
};

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
      projectSessions: {},

      openTab: ({ type, ref, mode, title, projectId }) => {
        const id = tabId(type, ref);
        const existing = get().tabs.find((t) => t.id === id);
        const project =
          projectId === undefined ? existing?.projectId : projectOf(projectId);
        if (existing) {
          set((state) => {
            const movedBetweenProjects = existing.projectId !== project;
            let projectSessions = updateSession(
              state.projectSessions,
              project,
              (session) => ({
                ...session,
                tabIds: session.tabIds.includes(id)
                  ? session.tabIds
                  : [...session.tabIds, id],
                activeTabId: id,
                selectedChatThreadId:
                  type === "chat" ? ref : session.selectedChatThreadId
              })
            );
            if (movedBetweenProjects) {
              projectSessions = updateSession(
                projectSessions,
                existing.projectId,
                (session) => ({
                  ...session,
                  tabIds: session.tabIds.filter((tabId) => tabId !== id),
                  activeTabId:
                    session.activeTabId === id
                      ? session.tabIds.find((tabId) => tabId !== id) ?? null
                      : session.activeTabId
                })
              );
            }
            return {
              activeTabId: id,
              projectSessions,
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
            };
          });
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
          activeTabId: id,
          projectSessions: updateSession(
            state.projectSessions,
            project,
            (session) => ({
              ...session,
              tabIds: [...session.tabIds, id],
              activeTabId: id,
              selectedChatThreadId:
                type === "chat" ? ref : session.selectedChatThreadId
            })
          )
        }));
        return id;
      },

      closeTab: (id) =>
        set((state) => {
          const tabs = state.tabs.filter((t) => t.id !== id);
          const closed = state.tabs.find((tab) => tab.id === id);
          const activeProjectId = state.activeProjectId;
          const globalNextActiveTabId = nextActiveAfterClose(
            state.tabs,
            state.activeTabId,
            id
          );
          return {
            tabs: gatherProjectTabs(tabs, activeProjectId),
            activeTabId: globalNextActiveTabId,
            activeProjectId,
            projectSessions: closed
              ? updateSession(state.projectSessions, closed.projectId, (session) => ({
                  ...session,
                  tabIds: session.tabIds.filter((tabId) => tabId !== id),
                  activeTabId:
                    session.activeTabId === id
                      ? session.tabIds.find((tabId) =>
                          tabId !== id &&
                          tabs.some(
                            (tab) =>
                              tab.id === tabId &&
                              tab.projectId === closed.projectId
                          )
                        ) ?? null
                      : session.activeTabId,
                  selectedChatThreadId:
                    session.selectedChatThreadId === closed.ref &&
                    closed.type === "chat"
                      ? null
                      : session.selectedChatThreadId
                }))
              : state.projectSessions
          };
        }),

      closeOthers: (id) =>
        set((state) => {
          const kept = state.tabs.filter((t) => t.id === id);
          const keptTab = kept[0];
          const projectSessions: Record<string, ProjectSession> = {};
          for (const key of Object.keys(state.projectSessions)) {
            const session = state.projectSessions[key];
            projectSessions[key] = {
              ...session,
              tabIds: session.tabIds.filter((tabId) => tabId === id),
              activeTabId: session.tabIds.includes(id) ? id : null,
              selectedChatThreadId:
                keptTab?.type === "chat" &&
                keptTab.ref === session.selectedChatThreadId
                  ? session.selectedChatThreadId
                  : null
            };
          }
          return {
            tabs: kept,
            activeTabId: kept.length > 0 ? id : null,
            activeProjectId: stillOpen(kept, state.activeProjectId),
            projectSessions
          };
        }),

      // Activating a tab that belongs to a project switches the scope to it;
      // a loose tab leaves the open project alone, so reading a scratch note
      // does not close the group the user is working in.
      setActiveTab: (id) =>
        set((state) => {
          const tab = state.tabs.find((t) => t.id === id);
          const project = tab?.projectId;
          const activeProjectId = project ?? state.activeProjectId;
          return {
            activeTabId: id,
            activeProjectId,
            projectSessions: updateSession(
              state.projectSessions,
              project,
              (session) => ({
                ...session,
                activeTabId: id,
                selectedChatThreadId:
                  tab?.type === "chat" ? tab.ref : session.selectedChatThreadId
              })
            ),
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
          const [movedTab] = tabs.splice(from, 1);
          tabs.splice(clampIndex(toIndex, tabs.length + 1), 0, movedTab);
          // A drop that would break the group is pulled back to the nearest
          // order that keeps it contiguous — the bar can show no other.
          const moved = state.tabs[from];
          const sessionTabIds = tabs
            .filter((tab) => tab.projectId === moved.projectId)
            .map((tab) => tab.id);
          return {
            tabs: gatherProjectTabs(tabs, state.activeProjectId),
            projectSessions: updateSession(
              state.projectSessions,
              moved.projectId,
              (session) => ({ ...session, tabIds: sessionTabIds })
            )
          };
        }),

      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId) ?? null;
      },

      setActiveProjectId: (projectId) =>
        set((state) => {
          const session = sessionFor(state.projectSessions, projectId ?? undefined);
          const currentTab = state.tabs.find(
            (tab) => tab.id === state.activeTabId
          );
          const fallbackTab = state.tabs.find((tab) =>
            projectId
              ? tab.projectId === projectId
              : tab.projectId === undefined
          );
          const activeTabId =
            session.activeTabId ??
            (currentTab &&
            (projectId
              ? currentTab.projectId === projectId
              : currentTab.projectId === undefined)
              ? currentTab.id
            : fallbackTab?.id) ??
            null;
          return {
            activeProjectId: projectId,
            activeTabId,
            tabs: gatherProjectTabs(state.tabs, projectId)
          };
        }),

      openProject: ({ id, name, documents }) =>
        set((state) => {
          const previous = sessionFor(state.projectSessions, id);
          const hasSession = Object.prototype.hasOwnProperty.call(
            state.projectSessions,
            id
          );
          const hasOpenTabs = previous.tabIds.length > 0;
          const overview: WorkspaceTab = {
            id: tabId("project", id),
            type: "project",
            ref: id,
            mode: "view",
            title: name,
            projectId: id
          };
          const documentTabs: WorkspaceTab[] = (documents ?? []).map((doc) => {
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
            });
          const available = new Map(
            documentTabs.map((tab) => [tab.id, tab] as const)
          );
          const owned = new Map(
            state.tabs
              .filter((tab) => tab.projectId === id)
              .map((tab) => [tab.id, tab] as const)
          );
          const restored = hasSession
            ? previous.tabIds
                .map((tabId) =>
                    tabId === overview.id
                      ? overview
                    : available.get(tabId) ??
                      (documents === undefined ? owned.get(tabId) : undefined)
                )
                .filter((tab): tab is WorkspaceTab => tab !== undefined)
            : [overview, ...documentTabs];
          const restoredIds = new Set(restored.map((tab) => tab.id));
          const finalProjectTabs = hasSession
            ? [
                ...restored,
                ...(hasOpenTabs
                  ? documentTabs.filter((tab) => !restoredIds.has(tab.id))
                  : [])
              ]
            : [overview, ...documentTabs];
          const finalIds = new Set(finalProjectTabs.map((tab) => tab.id));
          const others = state.tabs.filter(
            (t) => t.projectId !== id && !finalIds.has(t.id)
          );
          // The group lands where its first member already sat, so opening a
          // project the user has tabs from does not reshuffle the bar.
          const at = state.tabs.findIndex(
            (t) => finalIds.has(t.id)
          );
          const head = at === -1 ? others.length : Math.min(at, others.length);
          const activeTabId = hasSession
            ? previous.activeTabId && finalIds.has(previous.activeTabId)
              ? previous.activeTabId
              : null
            : overview.id;
          return {
            tabs: gatherProjectTabs(
              [
                ...others.slice(0, head),
                ...finalProjectTabs,
                ...others.slice(head)
              ],
              id
            ),
            activeTabId,
            activeProjectId: id,
            projectSessions: {
              ...state.projectSessions,
              [id]: {
                tabIds: finalProjectTabs.map((tab) => tab.id),
                activeTabId,
                selectedChatThreadId:
                  previous.selectedChatThreadId &&
                  finalProjectTabs.some(
                    (tab) =>
                      tab.type === "chat" &&
                      tab.ref === previous.selectedChatThreadId
                  )
                    ? previous.selectedChatThreadId
                    : null
              }
            }
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
          const projectSessions = { ...state.projectSessions };
          delete projectSessions[projectId];
          return {
            tabs: gatherProjectTabs(tabs, activeProjectId),
            activeTabId: activeStillOpen
              ? state.activeTabId
              : (neighbour?.id ?? null),
            activeProjectId,
            projectSessions
          };
        })
    }),
    {
      name: "workspace-tabs-storage",
      version: 2,
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        activeProjectId: state.activeProjectId,
        projectSessions: state.projectSessions
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
        const projectSessions =
          merged.projectSessions && Object.keys(merged.projectSessions).length > 0
            ? merged.projectSessions
            : sessionFromTabs(merged.tabs ?? [], merged.activeTabId ?? null);
        // An explicitly selected project remains selected after its last tab
        // is closed, so a new document still belongs to that project.
        const persistedProjectId = merged.activeProjectId ?? null;
        const activeProjectId =
          persistedProjectId &&
          Object.prototype.hasOwnProperty.call(
            projectSessions,
            persistedProjectId
          )
            ? persistedProjectId
            : stillOpen(merged.tabs ?? [], persistedProjectId);
        return {
          ...merged,
          projectSessions,
          activeProjectId,
          tabs: gatherProjectTabs(merged.tabs ?? [], activeProjectId)
        };
      },
      migrate: (persisted, version) => {
        const state = persisted as Partial<WorkspaceTabsState>;
        return {
          tabs: state.tabs ?? [],
          activeTabId: state.activeTabId ?? null,
          activeProjectId: state.activeProjectId ?? null,
          projectSessions:
            version < 2 || !state.projectSessions
              ? sessionFromTabs(state.tabs ?? [], state.activeTabId ?? null)
              : state.projectSessions
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
