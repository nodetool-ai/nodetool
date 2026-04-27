import { realtimeSessionClient } from "../RealtimeSessionClient";
import { globalWebSocketManager } from "../GlobalWebSocketManager";

jest.mock("../GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(),
    subscribe: jest.fn(),
    send: jest.fn()
  }
}));

const client = realtimeSessionClient;
const ws = globalWebSocketManager as jest.Mocked<typeof globalWebSocketManager>;

describe("RealtimeSessionClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ws.subscribe.mockReturnValue(jest.fn());
    ws.send.mockResolvedValue(undefined);
  });

  it("sends the loaded workflow graph when starting a realtime session", async () => {
    let handler: ((message: unknown) => void) | undefined;
    ws.subscribe.mockImplementation((_key, nextHandler) => {
      handler = nextHandler;
      return jest.fn();
    });

    const graph = {
      nodes: [{ id: "camera", type: "nodetool.video.VideoSource" }],
      edges: [{ source: "camera", target: "model" }]
    };

    const sessionPromise = client.startSession(
      "workflow-1",
      { brightness: 100 },
      graph,
      { transport: "websocket" }
    );

    handler?.({
      type: "realtime_session_started",
      session_id: "session-1",
      workflow_id: "workflow-1",
      job_id: "job-1",
      status: "running",
      transport: "websocket",
      parameters: { brightness: 100 },
      media_tracks: [],
      signaling: { status: "idle", offers: [], answers: [], candidates: [] },
      created_at: "2026-04-28T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z"
    });

    await expect(sessionPromise).resolves.toMatchObject({
      session_id: "session-1",
      workflow_id: "workflow-1"
    });

    expect(ws.send).toHaveBeenCalledWith({
      type: "start_realtime_session",
      command: "start_realtime_session",
      data: {
        workflow_id: "workflow-1",
        parameters: { brightness: 100 },
        graph,
        transport: "websocket",
        media_tracks: undefined,
        signaling: undefined
      }
    });
  });

  it("rejects failed realtime session start acknowledgements", async () => {
    let handler: ((message: unknown) => void) | undefined;
    ws.subscribe.mockImplementation((_key, nextHandler) => {
      handler = nextHandler;
      return jest.fn();
    });

    const sessionPromise = client.startSession("workflow-1", {}, {
      nodes: [],
      edges: []
    });

    handler?.({
      type: "realtime_session_ack",
      ok: false,
      action: "start",
      workflow_id: "workflow-1",
      error: "graph must be an object with nodes and edges arrays"
    });

    await expect(sessionPromise).rejects.toThrow(
      "graph must be an object with nodes and edges arrays"
    );
  });

  it("pushes deterministic realtime video frames through the session command surface", async () => {
    await client.pushInputFrame("session-1", "workflow-1", {
      trackId: "deterministic-video",
      frame: {
        type: "realtime_video_frame",
        data: new Uint8Array([255, 0, 0, 255]),
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "rgba8",
        timestamp_ns: 1000,
        sequence: 1
      }
    });

    expect(ws.ensureConnection).toHaveBeenCalledTimes(1);
    expect(ws.send).toHaveBeenCalledWith({
      type: "push_realtime_frame",
      command: "push_realtime_frame",
      data: {
        session_id: "session-1",
        workflow_id: "workflow-1",
        track_id: "deterministic-video",
        frame: {
          type: "realtime_video_frame",
          data: new Uint8Array([255, 0, 0, 255]),
          width: 1,
          height: 1,
          stride: 4,
          pixel_format: "rgba8",
          timestamp_ns: 1000,
          sequence: 1
        }
      }
    });
  });
});
