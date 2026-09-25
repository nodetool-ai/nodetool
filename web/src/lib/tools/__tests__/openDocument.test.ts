import { FrontendToolRegistry } from "../frontendTools";
import { waitFor } from "@testing-library/react";
import { stub } from "../../../test-utils/doubles";
import type { FrontendToolState } from "../frontendTools";
import {
  useWorkspaceTabsStore,
  tabId
} from "../../../stores/WorkspaceTabsStore";
import { registerAppRouter } from "../../appNavigation";
import {
  setTimelineAgentHandler,
  type TimelineAgentHandler,
  type TimelineSnapshot
} from "../../../components/timeline/timelineAgentBridge";
import "../builtin/openDocument";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: { get: { query: jest.fn() } },
    workflows: { get: { query: jest.fn() } },
    storyboards: { get: { query: jest.fn() } },
    scripts: { get: { query: jest.fn() } },
    jsScripts: { get: { query: jest.fn() } },
    sketch: { get: { query: jest.fn() } },
    applications: { get: { query: jest.fn() } },
    assets: { get: { query: jest.fn() } }
  }
}));

const snapshot = (sequenceId: string | null): TimelineSnapshot => ({
  sequenceId,
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 0,
  playheadMs: 0,
  selectedClipIds: [],
  tracks: [],
  clips: [],
  markers: [],
  mediaTracks: [],
  tempo: { bpm: 120, offsetMs: 0, timeSignature: { beatsPerBar: 4, beatUnit: 4 } }
});

const timelineHandler = (sequenceId: string | null): TimelineAgentHandler =>
  stub<TimelineAgentHandler>({
    getSnapshot: () => snapshot(sequenceId)
  });

const ctx = {
  getState: () =>
    stub<FrontendToolState>({
      getNodeStore: (workflowId: string) =>
        workflowId === "wf-open" ? ({} as never) : undefined
    })
};

const navigate = jest.fn();

const openDocument = (args: Record<string, unknown>) =>
  FrontendToolRegistry.call("ui_open_document", args, "tc-1", ctx);

beforeEach(() => {
  navigate.mockReset();
  registerAppRouter({ navigate });
  useWorkspaceTabsStore.setState({ tabs: [], activeTabId: null, activeProjectId: null });
  jest.mocked(trpcClient.timeline.get.query).mockImplementation(async ({ id }) => ({ id, projectId: "p-1" }) as never);
  jest.mocked(trpcClient.workflows.get.query).mockResolvedValue({ id: "wf-open", project_id: "p-1" } as never);
  setTimelineAgentHandler("seq-1", null);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ui_open_document", () => {
  it("switches to the document's project so its new tab mounts", async () => {
    useWorkspaceTabsStore.getState().setActiveProjectId("p-current");
    setTimelineAgentHandler("seq-1", timelineHandler("seq-1"));
    await openDocument({ type: "timeline", id: "seq-1" });
    const state = useWorkspaceTabsStore.getState();
    expect(state.activeProjectId).toBe("p-1");
    expect(state.tabs.find((tab) => tab.ref === "seq-1")?.projectId).toBe("p-1");
  });

  it("repairs an already-open tab with a stale project assignment", async () => {
    useWorkspaceTabsStore.getState().openTab({ type: "timeline", ref: "seq-1", mode: "edit" });
    setTimelineAgentHandler("seq-1", timelineHandler("seq-1"));
    await openDocument({ type: "timeline", id: "seq-1" });
    const state = useWorkspaceTabsStore.getState();
    expect(state.activeProjectId).toBe("p-1");
    expect(state.tabs.find((tab) => tab.ref === "seq-1")?.projectId).toBe("p-1");
  });

  it("restores the original project when opening in the background", async () => {
    useWorkspaceTabsStore.getState().setActiveProjectId("p-current");
    useWorkspaceTabsStore.getState().openTab({ type: "chat", ref: "t-1", projectId: "p-current" });
    setTimelineAgentHandler("seq-1", timelineHandler("seq-1"));
    await openDocument({ type: "timeline", id: "seq-1", focus: false });
    const state = useWorkspaceTabsStore.getState();
    expect(state.activeProjectId).toBe("p-current");
    expect(state.activeTabId).toBe(tabId("chat", "t-1"));
    expect(state.tabs.find((tab) => tab.ref === "seq-1")?.projectId).toBe("p-1");
  });
  it("resolves a compact timeline ID before opening and checking readiness", async () => {
    const fullId = "8d7d5e9d6f1f41111111111111111111";
    jest.mocked(trpcClient.timeline.get.query).mockResolvedValue({ id: fullId, projectId: "p-1" } as never);
    setTimelineAgentHandler(fullId, timelineHandler(fullId));
    try {
      await expect(openDocument({ type: "timeline", id: fullId.slice(0, 12) }))
        .resolves.toMatchObject({ ok: true, id: fullId });
      expect(useWorkspaceTabsStore.getState().tabs[0].ref).toBe(fullId);
    } finally {
      setTimelineAgentHandler(fullId, null);
    }
  });

  it("is in the manifest with the openable document types", () => {
    const tool = FrontendToolRegistry.getManifest().find(
      (t) => t.name === "ui_open_document"
    );
    expect(tool).toBeDefined();
    const schema = tool?.parameters as {
      properties?: { type?: { enum?: string[] } };
      required?: string[];
    };
    expect(schema.properties?.type?.enum).toEqual([
      "workflow",
      "timeline",
      "storyboard",
      "script",
      "jsscript",
      "sketch",
      "app"
    ]);
    expect(schema.required).toEqual(expect.arrayContaining(["type", "id"]));
  });

  it("opens a tab and resolves once the editor has loaded the document", async () => {
    const pending = openDocument({ type: "timeline", id: "seq-1" });
    await waitFor(() => {
      expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(1);
    });

    expect(useWorkspaceTabsStore.getState().tabs.map((tab) => tab.id)).toEqual([
      tabId("timeline", "seq-1")
    ]);
    expect(navigate).toHaveBeenCalledWith("/workspace");

    // The surface mounts and its query resolves.
    setTimelineAgentHandler("seq-1", timelineHandler("seq-1"));

    await expect(pending).resolves.toEqual({
      ok: true,
      type: "timeline",
      id: "seq-1",
      already_open: false,
      url: "timeline://seq-1"
    });
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(
      tabId("timeline", "seq-1")
    );
  });

  it("waits for the document to load, not just for the editor to mount", async () => {
    jest.useFakeTimers();
    // Registered but still loading — its snapshot has no sequence yet.
    setTimelineAgentHandler("seq-1", timelineHandler(null));
    const pending = openDocument({ type: "timeline", id: "seq-1" });
    const settled = jest.fn();
    void pending.then(settled, settled);

    await jest.advanceTimersByTimeAsync(1000);
    expect(settled).not.toHaveBeenCalled();

    setTimelineAgentHandler("seq-1", timelineHandler("seq-1"));
    await jest.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it("focuses an already-open document without reopening it", async () => {
    useWorkspaceTabsStore.getState().openTab({ type: "chat", ref: "t-1" });
    useWorkspaceTabsStore
      .getState()
      .openTab({ type: "timeline", ref: "seq-1", mode: "edit" });
    useWorkspaceTabsStore.getState().setActiveTab(tabId("chat", "t-1"));
    setTimelineAgentHandler("seq-1", timelineHandler("seq-1"));

    await expect(
      openDocument({ type: "timeline", id: "seq-1" })
    ).resolves.toMatchObject({ already_open: true });

    expect(useWorkspaceTabsStore.getState().tabs).toHaveLength(2);
    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(
      tabId("timeline", "seq-1")
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it("leaves the user's tab focused when focus is false", async () => {
    useWorkspaceTabsStore.getState().openTab({ type: "chat", ref: "t-1" });
    const pending = openDocument({
      type: "timeline",
      id: "seq-1",
      focus: false
    });
    setTimelineAgentHandler("seq-1", timelineHandler("seq-1"));
    await pending;

    expect(useWorkspaceTabsStore.getState().activeTabId).toBe(
      tabId("chat", "t-1")
    );
  });

  it("resolves a workflow once its node store exists", async () => {
    await expect(
      openDocument({ type: "workflow", id: "wf-open" })
    ).resolves.toMatchObject({ ok: true, type: "workflow", id: "wf-open" });
  });

  it("closes the tab and explains when the document never loads", async () => {
    jest.useFakeTimers();
    const pending = openDocument({ type: "timeline", id: "ghost" });
    const rejects = expect(pending).rejects.toThrow(
      'The timeline sequence "ghost" did not open'
    );
    await jest.advanceTimersByTimeAsync(21_000);
    await rejects;

    expect(useWorkspaceTabsStore.getState().tabs).toEqual([]);
  });
});
