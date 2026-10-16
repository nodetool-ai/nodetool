/**
 * A first run of a local model downloads it inside the run, and the caller —
 * a voiced script line, a workflow node — has no channel of its own to say so.
 * The session forwards the runtime's model load bus as `model_load_progress`,
 * gated like `system_stats`: a load on a server that enforces auth happens on
 * a host shared with other users.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unpack } from "msgpackr";
import {
  publishModelLoad,
  resetModelLoadsForTesting,
  type ModelLoadUpdate
} from "@nodetool-ai/runtime";
import { modelLoadProgressMessageOutSchema } from "@nodetool-ai/protocol";
import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";

class MockWS implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(): Promise<void> {}
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

const loadFrames = (ws: MockWS): Record<string, unknown>[] =>
  ws.sentBytes
    .map((b) => unpack(b) as Record<string, unknown>)
    .filter((m) => m["type"] === "model_load_progress");

const DOWNLOADING: ModelLoadUpdate = {
  repo_id: "onnx-community/Kokoro-82M-v1.0-ONNX",
  runtime: "transformers-js",
  phase: "downloading",
  loaded_bytes: 120,
  total_bytes: 330
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  resetModelLoadsForTesting();
});

afterEach(() => {
  resetModelLoadsForTesting();
});

describe("model load broadcast", () => {
  it("forwards each load update as a valid frame", async () => {
    const runner = new WebSocketClientSession({ systemStatsEnabled: true });
    const ws = new MockWS();
    await runner.connect(ws);

    publishModelLoad(DOWNLOADING);
    await flush();

    const frames = loadFrames(ws);
    expect(frames).toEqual([{ type: "model_load_progress", ...DOWNLOADING }]);
    expect(modelLoadProgressMessageOutSchema.safeParse(frames[0]).success).toBe(
      true
    );
    await runner.disconnect();
  });

  it("starts a client that connects mid-download from the current state", async () => {
    publishModelLoad(DOWNLOADING);
    const runner = new WebSocketClientSession({ systemStatsEnabled: true });
    const ws = new MockWS();
    await runner.connect(ws);
    await flush();

    expect(loadFrames(ws)).toEqual([
      { type: "model_load_progress", ...DOWNLOADING }
    ]);
    await runner.disconnect();
  });

  it("stops forwarding on disconnect", async () => {
    const runner = new WebSocketClientSession({ systemStatsEnabled: true });
    const ws = new MockWS();
    await runner.connect(ws);
    await runner.disconnect();

    publishModelLoad(DOWNLOADING);
    await flush();

    expect(loadFrames(ws)).toHaveLength(0);
  });

  it("sends nothing on a server that keeps host activity private", async () => {
    const runner = new WebSocketClientSession({ systemStatsEnabled: false });
    const ws = new MockWS();
    await runner.connect(ws);

    publishModelLoad(DOWNLOADING);
    await flush();

    expect(loadFrames(ws)).toHaveLength(0);
    await runner.disconnect();
  });
});
