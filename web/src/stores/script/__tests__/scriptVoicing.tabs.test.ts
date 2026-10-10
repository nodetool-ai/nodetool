/**
 * Voicing run tracking across tabs. A run another tab of the same browser is
 * voicing must read as live here, so the editor does not call it stopped and
 * a second Voice all does not pay for the same lines again.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from "@jest/globals";

/** An in-memory `BroadcastChannel`: delivers to every other instance by name. */
class FakeChannel {
  static all: FakeChannel[] = [];
  private listeners: Array<(event: { data: unknown }) => void> = [];
  constructor(readonly name: string) {
    FakeChannel.all.push(this);
  }
  addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.push(listener);
  }
  postMessage(data: unknown) {
    for (const other of FakeChannel.all) {
      if (other !== this && other.name === this.name) {
        other.listeners.forEach((listener) => listener({ data }));
      }
    }
  }
  close() {}
}

const pendingRpc = jest.fn(() => new Promise(() => {}));
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => pendingRpc(...(args as [])),
  randomRequestId: () => "req-test"
}));
jest.mock("../timelineSync", () => ({
  syncLineClipToTimeline: jest.fn(async () => undefined)
}));

let voicing: typeof import("../scriptVoicing");
let store: typeof import("../ScriptStore");
let otherTab: FakeChannel;
const heard: unknown[] = [];

beforeAll(async () => {
  (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeChannel;
  voicing = await import("../scriptVoicing");
  store = await import("../ScriptStore");
  otherTab = new FakeChannel("nodetool-script-voicing");
  otherTab.addEventListener("message", (event) => heard.push(event.data));
});

afterEach(() => {
  heard.length = 0;
});

const SCRIPT = "sc-tabs";

const seedVoicedScript = (): void => {
  store.useScriptStore.setState({
    scripts: {
      [SCRIPT]: {
        id: SCRIPT,
        title: "Film",
        cast: [
          {
            id: "sp-1",
            name: "Mara",
            voice: { provider: "openai", model: "tts-1", voice: "alloy" }
          }
        ],
        sections: [
          {
            id: "sec-1",
            lines: [
              {
                id: "ln-1",
                speakerId: "sp-1",
                text: "We are closed.",
                takes: [],
                currentTakeId: null
              }
            ]
          }
        ],
        timelineId: null,
        setup: { stage: "done", brief: "" }
      }
    }
  } as never);
};

describe("voicing in another tab", () => {
  it("reads another tab's run as live and refuses a second Voice all", async () => {
    seedVoicedScript();
    expect(voicing.isVoicingLive(SCRIPT)).toBe(false);

    otherTab.postMessage({ type: "live", scriptId: SCRIPT, page: "tab-b" });
    expect(voicing.isVoicingLive(SCRIPT)).toBe(true);
    await expect(voicing.voiceAll(SCRIPT)).rejects.toThrow(
      "This script is being voiced in another tab."
    );
    expect(pendingRpc).not.toHaveBeenCalled();

    otherTab.postMessage({ type: "ended", scriptId: SCRIPT, page: "tab-b" });
    expect(voicing.isVoicingLive(SCRIPT)).toBe(false);
  });

  it("tells other tabs about its own run, and answers a tab that asks", () => {
    seedVoicedScript();
    void voicing.voiceAll(SCRIPT);
    expect(heard).toContainEqual(
      expect.objectContaining({ type: "live", scriptId: SCRIPT })
    );

    heard.length = 0;
    otherTab.postMessage({ type: "ask", page: "tab-c" });
    expect(heard).toContainEqual(
      expect.objectContaining({ type: "live", scriptId: SCRIPT })
    );
  });
});
