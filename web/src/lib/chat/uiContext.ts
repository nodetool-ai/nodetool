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
  ChatSource,
  UiContext,
  UiDocumentRef,
  UiSurfaceType
} from "@nodetool-ai/protocol";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { isFunction } from "../../utils/typePredicates";

/**
 * Workspace tab types that have agent tools behind them. Tab types absent
 * here (image, audio, text, model3d, page) are omitted from `ui_context`:
 * listing an id the agent has no tool to act on only invites bad calls.
 *
 * An app is addressed by its application id, never by the id of a workflow it
 * binds. The app builder passes an explicit `focused` override carrying that
 * id, since the surface knows it and the tab list does not.
 */
const TAB_TYPE_TO_SURFACE: Partial<Record<WorkspaceTabType, UiSurfaceType>> = {
  workflow: "workflow",
  // An `application` tab's `ref` is the application id the `ui_app_*` tools
  // take. A tab not showing the builder has no handler registered, so those
  // tools answer with the "no app builder is open" error rather than guessing.
  application: "app",
  sketch: "sketch",
  timeline: "timeline",
  storyboard: "storyboard",
  script: "script",
  jsscript: "jsscript",
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
  /** Chat surface that sent this turn. Always forwarded to the LLM. */
  source?: ChatSource | null;
}

export type UiContextInput =
  | BuildUiContextOptions
  | (() => BuildUiContextOptions);

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

  const source = options.source ?? null;
  if (!focused && open.length === 0 && !source) {
    return null;
  }

  return {
    focused,
    open,
    selection: options.selection ?? null,
    source
  };
};

/** Resolve options that a composer may compute at send time. */
export const resolveUiContext = (
  input: UiContextInput | undefined,
  source?: ChatSource | null
): UiContext | null => {
  const options = isFunction(input) ? input() : (input ?? {});
  return buildUiContext({
    ...options,
    source: source ?? options.source
  });
};
