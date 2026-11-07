import fs from "node:fs";
import path from "node:path";
import { handleChatWebSocketMessage } from "../../../web/src/core/chat/chatProtocol";
import { DEFAULT_THREAD_RUNTIME } from "../../../web/src/core/chat/threadRuntime";
import type { GlobalChatState } from "../../../web/src/stores/GlobalChatStore";
import type { WebSocketMessage } from "../../../web/src/lib/websocket/GlobalWebSocketManager";

jest.mock("../../../web/src/lib/tools/frontendTools", () => ({
  FrontendToolRegistry: { has: jest.fn(() => false), call: jest.fn() }
}));
jest.mock("../../../web/src/lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    setResumeJobIdProvider: jest.fn(),
    subscribe: jest.fn(() => () => undefined),
    subscribeEvent: jest.fn(() => () => undefined),
    send: jest.fn().mockResolvedValue(undefined),
    ensureConnection: jest.fn().mockResolvedValue(undefined)
  }
}));

interface Fixture {
  threads: Array<{ id: string; title: string }>;
  events: WebSocketMessage[];
  expected: Array<Record<string, { status: string; messages: Array<{ role: string; text: string }> }>>;
}
const fixture: Fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../fixtures/streaming.json"), "utf8"));

function makeState(): GlobalChatState {
  // The production reducer reads this store slice. Browser actions are inert in replay.
  return {
    currentThreadId: fixture.threads[0].id,
    status: "connected",
    threads: Object.fromEntries(fixture.threads.map((thread) => [thread.id, thread])),
    threadRuntime: Object.fromEntries(fixture.threads.map((thread) => [thread.id, { ...DEFAULT_THREAD_RUNTIME }])),
    messageCache: {},
    chatReplayCursors: {},
    selectedModel: { provider: "", id: "" },
    summarizeThread: jest.fn(),
    updateThreadTitle: jest.fn()
  } as unknown as GlobalChatState;
}

async function replay(events: WebSocketMessage[]): Promise<unknown[]> {
  let state = makeState();
  const snapshots: unknown[] = [];
  for (const event of events) {
    await handleChatWebSocketMessage(event, (patch) => {
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
    }, () => state);
    snapshots.push(Object.fromEntries(fixture.threads.map(({ id }) => [id, {
      status: state.threadRuntime[id].status,
      messages: (state.messageCache[id] ?? []).map((message) => ({
        role: message.role,
        text: typeof message.content === "string" ? message.content : ""
      }))
    }])));
  }
  return snapshots;
}

test("native fixture expected projections match the production web reducer after every event", async () => {
  expect(fixture.events.length).toBeGreaterThan(0);
  expect(await replay(fixture.events)).toEqual(fixture.expected);
});

test("conformance detects a corrupted repeated delta", async () => {
  const corrupted = fixture.events.map((event, index) => index === 2 ? { ...event, content: "lost" } : event);
  expect(await replay(corrupted)).not.toEqual(fixture.expected);
});
