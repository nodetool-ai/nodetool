import { realtimeSessionClient } from "../RealtimeSessionClient";
import { globalWebSocketManager } from "../GlobalWebSocketManager";

jest.mock("../GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(),
    send: jest.fn()
  }
}));

const client = realtimeSessionClient;
const ws = globalWebSocketManager as jest.Mocked<typeof globalWebSocketManager>;

describe("RealtimeSessionClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
