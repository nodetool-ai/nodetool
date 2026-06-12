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
  | "model3d"
  | "audio"
  | "text";

export type WorkspaceTabMode = "view" | "edit";

export interface WorkspaceTab {
  /** Stable id, `${type}:${ref}` — one tab per document. */
  id: string;
  type: WorkspaceTabType;
  /** Document id: workflowId, sequenceId, assetId, sketchDocumentId, … */
  ref: string;
  mode: WorkspaceTabMode;
  title: string;
}

export interface OpenTabInput {
  type: WorkspaceTabType;
  ref: string;
  /**
   * New tabs default to "edit". For an existing tab the mode is only
   * updated when one is explicitly given.
   */
  mode?: WorkspaceTabMode;
  title?: string;
}

interface WorkspaceTabsState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;

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
}

export const tabId = (type: WorkspaceTabType, ref: string): string =>
  `${type}:${ref}`;

/**
 * Pick the tab that should become active after `closingId` is removed:
 * the tab to the right, else the tab to the left, else null.
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
      ? (parsed.filter((id) => typeof id === "string") as string[])
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

      openTab: ({ type, ref, mode, title }) => {
        const id = tabId(type, ref);
        const existing = get().tabs.find((t) => t.id === id);
        if (existing) {
          set((state) => ({
            activeTabId: id,
            tabs: state.tabs.map((t) =>
              t.id === id
                ? { ...t, mode: mode ?? t.mode, title: title ?? t.title }
                : t
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
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: id
        }));
        return id;
      },

      closeTab: (id) =>
        set((state) => ({
          activeTabId: nextActiveAfterClose(state.tabs, state.activeTabId, id),
          tabs: state.tabs.filter((t) => t.id !== id)
        })),

      closeOthers: (id) =>
        set((state) => {
          const kept = state.tabs.filter((t) => t.id === id);
          return {
            tabs: kept,
            activeTabId: kept.length > 0 ? id : null
          };
        }),

      setActiveTab: (id) => set({ activeTabId: id }),

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
          return { tabs };
        }),

      getActiveTab: () => {
        const { tabs, activeTabId } = get();
        return tabs.find((t) => t.id === activeTabId) ?? null;
      }
    }),
    {
      name: "workspace-tabs-storage",
      version: 1,
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId
      })
    }
  )
);
