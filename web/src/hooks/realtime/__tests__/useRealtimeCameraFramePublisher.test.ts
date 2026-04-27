/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";
import type { RealtimeSessionRecord } from "@nodetool/protocol";

import {
  captureVideoElementFrame,
  useRealtimeCameraFramePublisher
} from "../useRealtimeCameraFramePublisher";
import { realtimeSessionClient } from "../../../lib/websocket/RealtimeSessionClient";

jest.mock("../../../lib/websocket/RealtimeSessionClient", () => ({
  realtimeSessionClient: {
    pushInputFrame: jest.fn().mockResolvedValue(undefined)
  }
}));

const client = realtimeSessionClient as jest.Mocked<typeof realtimeSessionClient>;

const session = (): RealtimeSessionRecord => ({
  session_id: "session-1",
  workflow_id: "workflow-1",
  job_id: "job-1",
  status: "running",
  transport: "webrtc",
  parameters: {},
  media_tracks: [
    {
      track_id: "camera-track",
      kind: "video",
      node_id: "video-source",
      input_name: "camera",
      label: null,
      enabled: true
    }
  ],
  signaling: {
    status: "idle",
    last_signal_type: null,
    last_signal_at: null,
    error: null
  },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
});

const mockVideo = (
  width: number,
  height: number,
  createElement: typeof document.createElement = document.createElement.bind(document)
): HTMLVideoElement => {
  const video = createElement("video") as HTMLVideoElement;
  Object.defineProperty(video, "videoWidth", { value: width });
  Object.defineProperty(video, "videoHeight", { value: height });
  return video;
};

const mockCanvas = (pixels: number[]): HTMLCanvasElement => {
  return {
    width: 0,
    height: 0,
    getContext: jest.fn(() => ({
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({
        data: new Uint8ClampedArray(pixels)
      }))
    }))
  } as unknown as HTMLCanvasElement;
};

const mockStream = (): MediaStream => ({
  getVideoTracks: jest.fn(() => [{ id: "camera-track" } as MediaStreamTrack])
} as unknown as MediaStream);

describe("captureVideoElementFrame", () => {
  it("captures browser video pixels as an rgba8 realtime video frame", () => {
    const frame = captureVideoElementFrame(mockVideo(2, 1), {
      canvas: mockCanvas([255, 0, 0, 255, 0, 255, 0, 255]),
      sequence: 3,
      timestampNs: 1234,
      maxWidth: 320
    });

    expect(frame).toEqual({
      type: "realtime_video_frame",
      data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]),
      width: 2,
      height: 1,
      stride: 8,
      pixel_format: "rgba8",
      timestamp_ns: 1234,
      sequence: 3
    });
  });
});

describe("useRealtimeCameraFramePublisher", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("pushes captured camera frames to the active realtime session at debug cadence", async () => {
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "video") {
        const video = mockVideo(1, 1, originalCreateElement);
        video.play = jest.fn().mockResolvedValue(undefined);
        video.pause = jest.fn();
        return video;
      }
      if (tagName === "canvas") {
        return mockCanvas([9, 8, 7, 255]);
      }
      return originalCreateElement(tagName);
    });

    renderHook(() =>
      useRealtimeCameraFramePublisher({
        enabled: true,
        previewStream: mockStream(),
        session: session(),
        intervalMs: 250,
        maxWidth: 320
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(client.pushInputFrame).toHaveBeenCalledWith("session-1", "workflow-1", {
      trackId: "camera-track",
      frame: expect.objectContaining({
        type: "realtime_video_frame",
        data: new Uint8Array([9, 8, 7, 255]),
        width: 1,
        height: 1,
        stride: 4,
        pixel_format: "rgba8",
        sequence: 1
      })
    });
  });
});
