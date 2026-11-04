import { handleChatWebSocketMessage } from "../chatProtocol";
import { extractGenerationTurns } from "../../../components/chat/generation/extractGenerationTurns";
import type { WebSocketMessage } from "../../../lib/websocket/GlobalWebSocketManager";
import type { Message } from "../../../stores/ApiTypes";
import type { GlobalChatState } from "../../../stores/GlobalChatStore";
import { stub } from "../../../test-utils/doubles";

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    setResumeJobIdProvider: jest.fn(),
    subscribe: jest.fn(() => () => undefined),
    subscribeEvent: jest.fn(() => () => undefined),
    send: jest.fn().mockResolvedValue(undefined),
    ensureConnection: jest.fn().mockResolvedValue(undefined)
  }
}));

const THREAD = "thread-1";
const MEDIA = { mode: "image", provider: "fal", model: "m" };

/** The frames the server sends for one image turn, through the real handler. */
const runFrames = async (frames: object[]): Promise<GlobalChatState> => {
  let state = {
    status: "loading",
    currentThreadId: THREAD,
    threads: { [THREAD]: { id: THREAD, title: "T" } },
    threadRuntime: { [THREAD]: { status: "loading", statusMessage: null } },
    messageCache: {
      [THREAD]: [
        { id: "user-1", role: "user", type: "message", content: "a fox" }
      ]
    },
    updateThreadTitle: jest.fn(),
    summarizeThread: jest.fn()
  } as unknown as GlobalChatState;
  const set = (patch: unknown): void => {
    const next =
      typeof patch === "function"
        ? (patch as (s: GlobalChatState) => Partial<GlobalChatState>)(state)
        : (patch as Partial<GlobalChatState>);
    state = { ...state, ...next };
  };
  for (const frame of frames) {
    await handleChatWebSocketMessage(
      stub<WebSocketMessage>(frame),
      set,
      () => state,
      THREAD
    );
  }
  return state;
};

const progress = {
  type: "chunk",
  thread_id: THREAD,
  content: "",
  content_type: "text",
  content_metadata: { media_generation: MEDIA },
  done: false
};

const result = {
  type: "message",
  id: "assistant-1",
  thread_id: THREAD,
  role: "assistant",
  content: [{ type: "image_url", image: { type: "image", asset_id: "a1" } }],
  media_generation: MEDIA
};

const turnsOf = (state: GlobalChatState, status: "streaming" | "connected") =>
  extractGenerationTurns(state.messageCache[THREAD] as Message[], status);

describe("a media chat turn in the generation feed", () => {
  it("is pending after the empty progress chunk", async () => {
    const state = await runFrames([progress]);
    expect(turnsOf(state, "streaming")[0].isPending).toBe(true);
  });

  it("shows the picture as soon as the result message arrives", async () => {
    const state = await runFrames([
      progress,
      result,
      { type: "chunk", thread_id: THREAD, content: "", done: true }
    ]);
    const turns = turnsOf(state, "connected");
    expect(turns).toHaveLength(1);
    expect(turns[0].imageOutputs).toHaveLength(1);
  });
});
