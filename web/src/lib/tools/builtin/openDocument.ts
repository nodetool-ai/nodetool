/** Opens a document for the user and waits for its loaded editor handler. */

import { z } from "zod";
import {
  FrontendToolRegistry,
  type FrontendToolContext
} from "../frontendTools";
import {
  LOOSE_PROJECT_ID,
  tabId,
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../../stores/WorkspaceTabsStore";
import { navigateTo } from "../../appNavigation";
import { resolveDocumentProject } from "../../resolveDocumentProject";
import { docUrl } from "./resourceLinks";
import {
  hasTimelineAgentHandler,
  whenTimelineAgentReady
} from "../../../components/timeline/timelineAgentBridge";
import {
  hasStoryboardAgentHandler,
  whenStoryboardAgentReady
} from "../../../components/storyboard/storyboardAgentBridge";
import {
  hasScriptAgentHandler,
  whenScriptAgentReady
} from "../../../components/script/scriptAgentBridge";
import {
  hasJsScriptAgentHandler,
  whenJsScriptAgentReady
} from "../../../components/jsScript/jsScriptAgentBridge";
import {
  hasSketchAgentHandler,
  whenSketchAgentReady
} from "../../../components/sketch/sketchAgentBridge";
import {
  hasPuckAgentHandler,
  whenPuckAgentReady
} from "../../../components/appbuilder/puck/puckAgentBridge";

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

/** Editors register after loading, so handler presence means readiness. */
const isReady = {
  workflow: (id, ctx) => ctx.getState().getNodeStore(id) !== undefined,
  timeline: (id) => hasTimelineAgentHandler(id),
  storyboard: (id) => hasStoryboardAgentHandler(id),
  script: (id) => hasScriptAgentHandler(id),
  jsscript: (id) => hasJsScriptAgentHandler(id),
  sketch: (id) => hasSketchAgentHandler(id),
  app: (id) => hasPuckAgentHandler(id)
} satisfies Record<
  OpenableType,
  (id: string, ctx: FrontendToolContext) => boolean
>;

/**
 * The resource URI for a document, when the scheme has a kind for it. JS
 * scripts have no `ResourceKind` yet (the scheme lives in the protocol
 * package), so their result carries no link rather than a wrong one.
 */
const resourceLink = (type: OpenableType, id: string): { url?: string } =>
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

const waitUntilReady = (
  type: OpenableType,
  id: string,
  ctx: FrontendToolContext
): Promise<boolean> => {
  if (type === "workflow") {
    if (ready(type, id, ctx)) {
      return Promise.resolve(true);
    }
    return (
      ctx.getState().whenWorkflowReady?.(id, ctx.abortSignal) ??
      Promise.resolve(false)
    );
  }
  const wait = {
    timeline: whenTimelineAgentReady,
    storyboard: whenStoryboardAgentReady,
    script: whenScriptAgentReady,
    jsscript: whenJsScriptAgentReady,
    sketch: whenSketchAgentReady,
    app: whenPuckAgentReady
  };
  return wait[type](id, ctx.abortSignal);
};

FrontendToolRegistry.register({
  name: "ui_open_document",
  description:
    "Open a document in the workspace as a tab so the other ui_* tools can act on it. Use this to show a document to the user. For edits to a closed timeline, storyboard, script or sketch, use its server edit capability. Types: workflow, timeline, storyboard, script, jsscript, sketch, app. The id is the document's id (from list_timelines, list_sketches, list_storyboards, list_scripts, list_js_scripts, a resource link, or the user). Documents open in edit mode; already-open documents are focused rather than duplicated. Returns once the editor has loaded and the document's tools are usable.",
  parameters: z.object({
    type: z
      .enum(OPENABLE_TYPES)
      .describe("Kind of document to open, as named in the ui_context block."),
    id: z.string().trim().min(1).describe("Id of the document to open.")
  }),
  async execute({ type, id }, ctx) {
    const document = await resolveDocumentProject(TAB_TYPE[type], id);
    id = document.id;
    const tabs = useWorkspaceTabsStore.getState();
    const previousProjectId = tabs.activeProjectId;
    const previousActiveTabId = tabs.activeTabId;
    const wasOpen = tabs.tabs.some(
      (tab) => tab.id === tabId(TAB_TYPE[type], id)
    );

    if (wasOpen && ready(type, id, ctx)) {
      tabs.setActiveProjectId(document.projectId ?? null);
      tabs.openTab({
        type: TAB_TYPE[type],
        ref: id,
        mode: "edit",
        projectId: document.projectId ?? LOOSE_PROJECT_ID
      });
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
    tabs.setActiveProjectId(document.projectId ?? null);
    tabs.openTab({
      type: TAB_TYPE[type],
      ref: id,
      mode: "edit",
      projectId: document.projectId ?? LOOSE_PROJECT_ID
    });

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
    }
    tabs.setActiveProjectId(previousProjectId);
    if (previousActiveTabId) tabs.setActiveTab(previousActiveTabId);
    throw new Error(
      `The ${LABEL[type]} "${id}" did not open. Check that the id is right — ` +
        `it may have been deleted, or belong to another user.`
    );
  }
});
