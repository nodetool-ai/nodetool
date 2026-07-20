// uiContext.ts
// -----------------------------------------------------------------
// Builds the `ui_context` the chat composer sends with every message:
// which documents are open, which one has focus, and what is selected
// inside it. The server renders this into the system prompt.
//
// This matters because every `ui_*` tool takes a REQUIRED document id —
// there is no "act on whatever editor is mounted" fallback. Without this
// block the agent has discoverable tools and no valid ids to call them
// with, so treat it as part of the tool contract, not as decoration.
// -----------------------------------------------------------------

import type {
  UiContext,
  UiDocumentRef,
  UiSurfaceType
} from "@nodetool-ai/protocol";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";

/**
 * Workspace tab types that have agent tools behind them. Tab types absent
 * here (image, audio, text, model3d, page) are omitted from `ui_context`:
 * listing an id the agent has no tool to act on only invites bad calls.
 *
 * The app builder has no tab type of its own — it is a route
 * (`/app-builder/:workflowId`) whose document lives on `workflows.app_doc`,
 * so that surface passes an explicit `focused` override instead.
 */
const TAB_TYPE_TO_SURFACE: Partial<Record<WorkspaceTabType, UiSurfaceType>> = {
  workflow: "workflow",
  sketch: "sketch",
  timeline: "timeline",
  storyboard: "storyboard",
  script: "script",
  chat: "chat"
};

const toRef = (tab: WorkspaceTab): UiDocumentRef | null => {
  const type = TAB_TYPE_TO_SURFACE[tab.type];
  return type ? { type, id: tab.ref, title: tab.title } : null;
};

const isSameDoc = (a: UiDocumentRef, b: UiDocumentRef): boolean =>
  a.type === b.type && a.id === b.id;

export interface BuildUiContextOptions {
  /**
   * Surfaces that aren't workspace tabs (the app builder) or that know their
   * focus better than the tab store does pass it here. It is added to `open`
   * when the tab list doesn't already carry it.
   */
  focused?: UiDocumentRef | null;
  selection?: UiContext["selection"];
}

/**
 * Snapshot the open documents. Reads the store imperatively via `getState`
 * because this runs inside a send handler, not during render.
 */
export const buildUiContext = (
  options: BuildUiContextOptions = {}
): UiContext | null => {
  const { tabs, activeTabId } = useWorkspaceTabsStore.getState();
  const open = tabs
    .map(toRef)
    .filter((ref): ref is UiDocumentRef => ref !== null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const focused =
    options.focused ?? (activeTab ? toRef(activeTab) : null) ?? null;

  if (focused && !open.some((ref) => isSameDoc(ref, focused))) {
    open.push(focused);
  }

  if (!focused && open.length === 0) {
    return null;
  }

  return {
    focused,
    open,
    selection: options.selection ?? null
  };
};
