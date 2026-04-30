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

const mockPublisherElements = (
  pixels: number[] = [9, 8, 7, 255]
): HTMLVideoElement => {
  const originalCreateElement = document.createElement.bind(document);
  const video = mockVideo(1, 1, originalCreateElement);
  video.play = jest.fn().mockResolvedValue(undefined);
  video.pause = jest.fn();

  jest.spyOn(document, "createElement").mockImplementation((tagName) => {
    if (tagName === "video") {
      return video;
    }
    if (tagName === "canvas") {
      return mockCanvas(pixels);
    }
    return originalCreateElement(tagName);
  });

  return video;
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

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
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("reports active route and cadence after publishing a camera frame", async () => {
    mockPublisherElements();

    const { result } = renderHook(() =>
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
    expect(result.current).toMatchObject({
      active: true,
      trackId: "camera-track",
      nodeId: "video-source",
      inputName: "camera",
      sourceHandle: "frame",
      intervalMs: 250,
      targetFps: 4,
      framesPublished: 1,
      lastError: null,
      skippedReason: null
    });
  });

  it("publishes at the 60fps test cadence", async () => {
    mockPublisherElements([1, 2, 3, 255]);
    const activeSession = session();
    const stream = mockStream();

    const { result } = renderHook(() =>
      useRealtimeCameraFramePublisher({
        enabled: true,
        previewStream: stream,
        session: activeSession,
        framePushMode: "60fps",
        maxWidth: 320
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(17);
      await Promise.resolve();
    });

    expect(client.pushInputFrame).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      targetFps: 60,
      framesPublished: 1,
      framesSkipped: 0
    });
  });

  it("skips stale frames when a push is already in flight", async () => {
    mockPublisherElements([1, 2, 3, 255]);
    const activeSession = session();
    const stream = mockStream();
    const push = deferred<void>();
    client.pushInputFrame.mockReturnValue(push.promise);

    const { result } = renderHook(() =>
      useRealtimeCameraFramePublisher({
        enabled: true,
        previewStream: stream,
        session: activeSession,
        intervalMs: 10,
        maxWidth: 320,
        maxInFlightFrames: 1
      })
    );

    await act(async () => {
      jest.advanceTimersByTime(10);
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(10);
      await Promise.resolve();
    });

    expect(client.pushInputFrame).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({
      framesPublished: 1,
      framesSkipped: 1,
      inFlightFrames: 1
    });

    await act(async () => {
      push.resolve(undefined);
      await Promise.resolve();
    });
    expect(result.current.inFlightFrames).toBe(0);
  });

  it("uses requestVideoFrameCallback for uncapped publishing when available", async () => {
    const video = mockPublisherElements([5, 6, 7, 255]);
    const activeSession = session();
    const stream = mockStream();
    const callbacks: Array<(now: number) => void> = [];
    const requestVideoFrameCallback = jest.fn((callback: (now: number) => void) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancelVideoFrameCallback = jest.fn();
    Object.assign(video, {
      requestVideoFrameCallback,
      cancelVideoFrameCallback
    });

    const { result } = renderHook(() =>
      useRealtimeCameraFramePublisher({
        enabled: true,
        previewStream: stream,
        session: activeSession,
        framePushMode: "uncapped",
        maxWidth: 320
      })
    );

    await act(async () => {
      callbacks[0]?.(performance.now());
      await Promise.resolve();
    });

    expect(requestVideoFrameCallback).toHaveBeenCalled();
    expect(client.pushInputFrame).toHaveBeenCalledTimes(1);
    expect(result.current.targetFps).toBe(0);
    expect(result.current.framesPublished).toBe(1);
    expect(cancelVideoFrameCallback).not.toHaveBeenCalled();
  });

  it("reports a missing route when no enabled video track matches the preview stream", () => {
    const { result } = renderHook(() =>
      useRealtimeCameraFramePublisher({
        enabled: true,
        previewStream: {
          getVideoTracks: jest.fn(() => [
            { id: "other-track" } as MediaStreamTrack
          ])
        } as unknown as MediaStream,
        session: {
          ...session(),
          media_tracks: [
            {
              track_id: "camera-track",
              kind: "video",
              node_id: "video-source",
              input_name: "camera",
              label: null,
              enabled: false
            }
          ]
        },
        intervalMs: 250,
        maxWidth: 320
      })
    );

    expect(result.current).toMatchObject({
      active: false,
      trackId: null,
      framesPublished: 0,
      skippedReason: "no_enabled_video_track"
    });
  });
});
