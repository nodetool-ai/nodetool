// builtin/openDocument.ts
// -----------------------------------------------------------------
// `ui_open_document` — open a document as a workspace tab.
//
// Every editor `ui_*` tool acts on a document the user has *open*: each
// mounted editor registers a handler under its document id, and a tool
// called with an id nothing has registered fails with "No timeline
// sequence … is open". Before this tool that was a dead end — the agent
// could find a document id (`list_timelines`, `list_sketches`, a link the
// user pasted) and still have no way to act on it.
//
// Opening a tab mounts that document's surface, which registers the
// handler, so this is the bridge between "an id exists" and "the ui_*
// tools work on it". Tabs stay mounted in the background, so opening one
// does not close or unmount anything else.
// -----------------------------------------------------------------

import { z } from "zod";
import {
  FrontendToolRegistry,
  type FrontendToolContext
} from "../frontendTools";
import {
  tabId,
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../../stores/WorkspaceTabsStore";
import { navigateTo } from "../../appNavigation";
import { docUrl } from "./resourceLinks";
import {
  getTimelineAgentHandler,
  hasTimelineAgentHandler
} from "../../../components/timeline/timelineAgentBridge";
import {
  getStoryboardAgentHandler,
  hasStoryboardAgentHandler
} from "../../../components/storyboard/storyboardAgentBridge";
import {
  getScriptAgentHandler,
  hasScriptAgentHandler
} from "../../../components/script/scriptAgentBridge";
import {
  getJsScriptAgentHandler,
  hasJsScriptAgentHandler
} from "../../../components/jsScript/jsScriptAgentBridge";
import {
  getSketchAgentHandler,
  hasSketchAgentHandler
} from "../../../components/sketch/sketchAgentBridge";
import { hasPuckAgentHandler } from "../../../components/appbuilder/puck/puckAgentBridge";

/**
 * Document kinds with agent tools behind them, named the way `ui_context`
 * names them (an app is "app", not "application").
 */
const OPENABLE_TYPES = [
  "workflow",
  "timeline",
  "storyboard",
  "script",
  "jsscript",
  "sketch",
  "app"
] as const;

type OpenableType = (typeof OPENABLE_TYPES)[number];

const TAB_TYPE = {
  workflow: "workflow",
  timeline: "timeline",
  storyboard: "storyboard",
  script: "script",
  jsscript: "jsscript",
  sketch: "sketch",
  app: "application"
} satisfies Record<OpenableType, WorkspaceTabType>;

const LABEL = {
  workflow: "workflow",
  timeline: "timeline sequence",
  storyboard: "storyboard",
  script: "script",
  jsscript: "JS script",
  sketch: "image document",
  app: "app"
} satisfies Record<OpenableType, string>;

/**
 * True once the document's editor has mounted *and* loaded — the point at
 * which the `ui_*` tools for it work. Handler presence alone is not enough:
 * a surface registers its handler while its document query is still in
 * flight, and an agent that read the snapshot then would see an empty
 * document. Each probe therefore checks the loaded document's own id.
 */
const isReady = {
  workflow: (id, ctx) => ctx.getState().getNodeStore(id) !== undefined,
  timeline: (id) =>
    hasTimelineAgentHandler(id) &&
    getTimelineAgentHandler(id).getSnapshot().sequenceId === id,
  storyboard: (id) =>
    hasStoryboardAgentHandler(id) &&
    getStoryboardAgentHandler(id).getSnapshot().boardId === id,
  script: (id) =>
    hasScriptAgentHandler(id) &&
    getScriptAgentHandler(id).getSnapshot().scriptId === id,
  jsscript: (id) =>
    hasJsScriptAgentHandler(id) &&
    getJsScriptAgentHandler(id).getSnapshot().scriptId === id,
  sketch: (id) =>
    hasSketchAgentHandler(id) &&
    getSketchAgentHandler(id).getSnapshot().documentId === id,
  app: (id) => hasPuckAgentHandler(id)
} satisfies Record<OpenableType, (id: string, ctx: FrontendToolContext) => boolean>;


/**
 * The resource URI for a document, when the scheme has a kind for it. JS
 * scripts have no `ResourceKind` yet (the scheme lives in the protocol
 * package), so their result carries no link rather than a wrong one.
 */
const resourceLink = (
  type: OpenableType,
  id: string
): { url?: string } =>
  type === "jsscript" ? {} : { url: docUrl(type, id) };

const ready = (
  type: OpenableType,
  id: string,
  ctx: FrontendToolContext
): boolean => {
  try {
    return isReady[type](id, ctx);
  } catch {
    // A surface mid-mount can throw out of its stores; that just means
    // "not ready yet".
    return false;
  }
};

/** How long to wait for a freshly-opened surface to mount and load. */
const READY_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 100;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitUntilReady = async (
  type: OpenableType,
  id: string,
  ctx: FrontendToolContext
): Promise<boolean> => {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (ready(type, id, ctx)) return true;
    if (ctx.abortSignal.aborted) return false;
    await delay(POLL_INTERVAL_MS);
  }
  return ready(type, id, ctx);
};

FrontendToolRegistry.register({
  name: "ui_open_document",
  description:
    "Open a document in the workspace as a tab so the other ui_* tools can act on it. Use this when a ui_* tool reports that the document is not open, or when the user names a document that is not in the open list — do not report a document as unavailable until you have tried to open it. Types: workflow, timeline, storyboard, script, jsscript, sketch, app. The id is the document's id (from list_timelines, list_sketches, list_storyboards, list_scripts, list_js_scripts, a resource link, or the user). Documents open in edit mode; already-open documents are focused rather than duplicated. Returns once the editor has loaded and the document's tools are usable.",
  parameters: z.object({
    type: z
      .enum(OPENABLE_TYPES)
      .describe("Kind of document to open, as named in the ui_context block."),
    id: z.string().trim().min(1).describe("Id of the document to open."),
    focus: z
      .boolean()
      .optional()
      .describe(
        "Switch the workspace to this tab (default true). Pass false to open it in the background and leave the user where they are."
      )
  }),
  async execute({ type, id, focus }, ctx) {
    const tabs = useWorkspaceTabsStore.getState();
    const wasOpen = tabs.tabs.some(
      (tab) => tab.id === tabId(TAB_TYPE[type], id)
    );

    if (wasOpen && ready(type, id, ctx)) {
      if (focus !== false) tabs.setActiveTab(tabId(TAB_TYPE[type], id));
      return {
        ok: true,
        type,
        id,
        already_open: true,
        ...resourceLink(type, id)
      };
    }

    // Tabs only mount inside the workspace shell, so a session driving the
    // agent from a legacy route has to land there first.
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/workspace")
    ) {
      navigateTo("/workspace");
    }

    // Editors register their agent handler; viewers do not — so always edit.
    const previousActiveTabId = tabs.activeTabId;
    tabs.openTab({ type: TAB_TYPE[type], ref: id, mode: "edit" });
    if (focus === false && previousActiveTabId) {
      tabs.setActiveTab(previousActiveTabId);
    }

    if (await waitUntilReady(type, id, ctx)) {
      return {
        ok: true,
        type,
        id,
        already_open: wasOpen,
        ...resourceLink(type, id)
      };
    }

    // Nothing loaded — leave no broken tab behind for the user to close.
    if (!wasOpen) {
      useWorkspaceTabsStore.getState().closeTab(tabId(TAB_TYPE[type], id));
      if (previousActiveTabId) {
        useWorkspaceTabsStore.getState().setActiveTab(previousActiveTabId);
      }
    }
    throw new Error(
      `The ${LABEL[type]} "${id}" did not open. Check that the id is right — ` +
        `it may have been deleted, or belong to another user.`
    );
  }
});
