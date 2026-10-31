import type { StoreApi, UseBoundStore } from "zustand";
import {
  cancelGeneration,
  generationFromCommand,
  startGenerationActivityTracking
} from "../useGenerationActivityTracking";
import { useGenerationActivityStore } from "../../stores/GenerationActivityStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { lookupGenerations } from "../../lib/websocket/lookupGenerations";
import { rpcRequest } from "../../lib/websocket/rpcRequest";

type Listener = (...args: unknown[]) => void;
const mockListeners = new Map<string, Set<Listener>>();
const mockEmit = (event: string, ...args: unknown[]): void => {
  mockListeners.get(event)?.forEach((listener) => listener(...args));
};

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribeEvent: (event: string, listener: Listener) => {
      if (!mockListeners.has(event)) {
        mockListeners.set(event, new Set());
      }
      mockListeners.get(event)!.add(listener);
      return () => mockListeners.get(event)?.delete(listener);
    }
  }
}));

jest.mock("../../lib/websocket/lookupGenerations", () => ({
  isSettled: (status: string) => status !== "running" && status !== "pending",
  lookupGenerations: jest.fn()
}));

jest.mock("../../lib/websocket/rpcRequest", () => ({
  rpcRequest: jest.fn().mockResolvedValue({})
}));

interface MockChatState {
  threads: Record<string, { title: string }>;
  threadRuntime: Record<string, { status: string; error: string | null }>;
  stopGeneration: jest.Mock;
}

jest.mock("../../stores/GlobalChatStore", () => {
  const { create: createStore } = jest.requireActual("zustand");
  return {
    __esModule: true,
    default: createStore(() => ({
      threads: { t1: { title: "Poster ideas" } },
      threadRuntime: {},
      stopGeneration: jest.fn()
    }))
  };
});

const mockChatStore = jest.requireMock("../../stores/GlobalChatStore")
  .default as UseBoundStore<StoreApi<MockChatState>>;

const generations = () => useGenerationActivityStore.getState().generations;

describe("generationFromCommand", () => {
  it("reads a generate_media request", () => {
    const generation = generationFromCommand(
      {
        command: "generate_media",
        request_id: "req-1",
        data: { mode: "image_to_video", prompt: "pan left", model: "veo" }
      },
      { type: "storyboard", ref: "board-1", title: "Launch film" },
      5
    );
    expect(generation).toMatchObject({
      id: "req-1",
      channel: "rpc",
      kind: "video",
      prompt: "pan left",
      model: "veo",
      source: { type: "storyboard", ref: "board-1" },
      startedAt: 5
    });
  });

  it("keeps the request's settings and presets for a retake", () => {
    const generation = generationFromCommand(
      {
        command: "generate_media",
        request_id: "req-2",
        data: {
          mode: "video",
          prompt: "dolly in",
          provider: "fake",
          model: "wan",
          seed: 9,
          preset_ids: ["camera.arc"]
        }
      },
      null
    );
    expect(generation?.preset_ids).toEqual(["camera.arc"]);
    expect(generation?.request).toEqual({
      mode: "video",
      provider: "fake",
      model: "wan",
      seed: 9,
      preset_ids: ["camera.arc"]
    });
  });

  it("reads a media chat turn and skips a text one", () => {
    expect(
      generationFromCommand(
        {
          command: "chat_message",
          data: {
            id: "m1",
            thread_id: "t1",
            content: [{ type: "text", text: "a lighthouse" }],
            media_generation: { mode: "image", model: "flux" }
          }
        },
        null
      )
    ).toMatchObject({
      id: "m1",
      channel: "chat",
      kind: "image",
      prompt: "a lighthouse",
      threadId: "t1",
      source: { type: "chat", ref: "t1", title: "Poster ideas" }
    });
    expect(
      generationFromCommand(
        {
          command: "chat_message",
          data: {
            id: "m2",
            thread_id: "t1",
            content: "hi",
            media_generation: { mode: "chat" }
          }
        },
        null
      )
    ).toBeNull();
  });
});

describe("startGenerationActivityTracking", () => {
  let stop: () => void;

  beforeEach(() => {
    jest.useFakeTimers();
    mockListeners.clear();
    jest.mocked(lookupGenerations).mockReset();
    jest.mocked(rpcRequest).mockClear();
    useGenerationActivityStore.setState({ generations: {} });
    mockChatStore.setState({ threadRuntime: {} });
    useWorkspaceTabsStore.setState({
      tabs: [
        {
          id: "sketch:s1",
          type: "sketch",
          ref: "s1",
          mode: "edit",
          title: "Cover art"
        }
      ],
      activeTabId: "sketch:s1"
    });
  });

  afterEach(() => {
    stop?.();
    jest.useRealTimers();
  });

  it("lists a generate_media request under the tab that sent it and settles it from the reply", () => {
    stop = startGenerationActivityTracking();
    mockEmit("send", {
      command: "generate_media",
      request_id: "req-1",
      data: { mode: "image", prompt: "a fox" }
    });
    expect(generations()["req-1"]).toMatchObject({
      status: "generating",
      source: { type: "sketch", ref: "s1", title: "Cover art" }
    });

    mockEmit("message", {
      type: "rpc_response",
      request_id: "req-1",
      result: { asset_ids: ["a1"] }
    });
    expect(generations()["req-1"]).toMatchObject({
      status: "generated",
      assetIds: ["a1"]
    });
  });

  it("marks a request failed when its reply carries an error", () => {
    stop = startGenerationActivityTracking();
    mockEmit("send", { command: "generate_media", request_id: "req-1", data: {} });
    mockEmit("message", {
      type: "rpc_response",
      request_id: "req-1",
      error: { message: "Out of credits" }
    });
    expect(generations()["req-1"]).toMatchObject({
      status: "failed",
      error: "Out of credits"
    });
  });

  it("looks up requests whose reply went to a closed socket", async () => {
    jest.mocked(lookupGenerations).mockResolvedValue(
      new Map([
        [
          "req-1",
          {
            requestId: "req-1",
            generationId: "g1",
            status: "completed",
            assetIds: ["a1"],
            error: null
          }
        ]
      ])
    );
    stop = startGenerationActivityTracking();
    mockEmit("send", { command: "generate_media", request_id: "req-1", data: {} });
    mockEmit("close");

    await jest.advanceTimersByTimeAsync(3_000);

    expect(lookupGenerations).toHaveBeenCalledWith(["req-1"]);
    expect(generations()["req-1"]).toMatchObject({
      status: "generated",
      assetIds: ["a1"]
    });
  });

  it("follows a workflow run's media prediction and skips other capabilities", () => {
    stop = startGenerationActivityTracking();
    mockEmit("message", {
      type: "prediction",
      id: "p1",
      capability: "text_to_image",
      status: "running",
      workflow_id: "wf-1",
      model: "flux",
      params: { prompt: "neon city" }
    });
    mockEmit("message", {
      type: "prediction",
      id: "p2",
      capability: "chat",
      status: "running"
    });
    expect(Object.keys(generations())).toEqual(["p1"]);
    expect(generations().p1).toMatchObject({
      channel: "prediction",
      prompt: "neon city",
      source: { type: "workflow", ref: "wf-1" }
    });

    mockEmit("message", {
      type: "prediction",
      id: "p1",
      capability: "text_to_image",
      status: "completed",
      asset_ids: ["a2"]
    });
    expect(generations().p1).toMatchObject({
      status: "generated",
      assetIds: ["a2"]
    });
  });

  it("does not list a prediction twice when its request is already listed", () => {
    stop = startGenerationActivityTracking();
    mockEmit("send", { command: "generate_media", request_id: "req-1", data: {} });
    mockEmit("message", {
      type: "prediction",
      id: "p1",
      capability: "text_to_image",
      status: "running",
      origin: { surface: "rpc", request_id: "req-1" }
    });
    expect(Object.keys(generations())).toEqual(["req-1"]);
  });

  it("settles a media chat turn when its thread goes idle", () => {
    stop = startGenerationActivityTracking();
    mockChatStore.setState({
      threadRuntime: { t1: { status: "loading", error: null } }
    });
    mockEmit("send", {
      command: "chat_message",
      data: {
        id: "m1",
        thread_id: "t1",
        content: "a lighthouse",
        media_generation: { mode: "image" }
      }
    });
    expect(generations().m1.status).toBe("generating");

    mockChatStore.setState({
      threadRuntime: { t1: { status: "idle", error: null } }
    });
    expect(generations().m1.status).toBe("generated");
  });

  it("drops chat and prediction generations a reload can no longer follow", () => {
    useGenerationActivityStore.setState({
      generations: {
        m1: {
          id: "m1",
          channel: "chat",
          status: "generating",
          kind: "image",
          prompt: null,
          model: null,
          source: null,
          threadId: "t1",
          startedAt: 1,
          endedAt: null,
          assetIds: [],
          error: null
        }
      }
    });
    stop = startGenerationActivityTracking();
    expect(generations()).toEqual({});
  });
});

describe("cancelGeneration", () => {
  beforeEach(() => {
    useGenerationActivityStore.setState({ generations: {} });
  });

  it("cancels a generate_media request on the server", async () => {
    const generation = generationFromCommand(
      { command: "generate_media", request_id: "req-1", data: {} },
      null
    )!;
    useGenerationActivityStore.getState().start(generation);
    await cancelGeneration(generation);
    expect(rpcRequest).toHaveBeenCalledWith("cancel_generation", {
      request_ids: ["req-1"]
    });
    expect(generations()["req-1"].status).toBe("cancelled");
  });

  it("stops the thread of a media chat turn", async () => {
    const generation = generationFromCommand(
      {
        command: "chat_message",
        data: {
          id: "m1",
          thread_id: "t1",
          content: "x",
          media_generation: { mode: "image" }
        }
      },
      null
    )!;
    useGenerationActivityStore.getState().start(generation);
    await cancelGeneration(generation);
    expect(mockChatStore.getState().stopGeneration).toHaveBeenCalledWith("t1");
    expect(generations().m1.status).toBe("cancelled");
  });
});
