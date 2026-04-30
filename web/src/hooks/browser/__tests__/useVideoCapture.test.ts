import { act, renderHook, waitFor } from "@testing-library/react";
import { useVideoCapture } from "../useVideoCapture";

const mockGetUserMedia = jest.fn();
const mockEnumerateDevices = jest.fn();

Object.defineProperty(global.navigator, "mediaDevices", {
  value: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices
  },
  writable: true
});

const createMockTrack = (): MediaStreamTrack => {
  return {
    id: "track-1",
    label: "USB Camera",
    enabled: true,
    muted: false,
    readyState: "live",
    getSettings: jest.fn(() => ({
      width: 640,
      height: 480,
      frameRate: 30
    })),
    getCapabilities: jest.fn(() => ({
      width: { min: 160, max: 1920 },
      height: { min: 120, max: 1080 },
      frameRate: { min: 1, max: 30 }
    })),
    stop: jest.fn()
  } as unknown as MediaStreamTrack;
};

const createMockStream = (): MediaStream => {
  const tracks = [createMockTrack()];
  return {
    getTracks: jest.fn(() => tracks),
    getVideoTracks: jest.fn(() => tracks)
  } as unknown as MediaStream;
};

describe("useVideoCapture", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMedia.mockReset();
    mockEnumerateDevices.mockReset();
  });

  it("does not auto-fetch devices when disabled", () => {
    renderHook(() =>
      useVideoCapture({ includeAudio: false, autoFetchDevices: false, warmupMs: 0 })
    );

    expect(mockGetUserMedia).not.toHaveBeenCalled();
    expect(mockEnumerateDevices).not.toHaveBeenCalled();
  });

  it("maps and deduplicates available devices", async () => {
    const permissionStream = createMockStream();
    mockGetUserMedia.mockResolvedValue(permissionStream);
    mockEnumerateDevices.mockResolvedValue([
      { kind: "videoinput", deviceId: "default", label: "" },
      { kind: "videoinput", deviceId: "camera-1", label: "USB Camera" },
      { kind: "videoinput", deviceId: "camera-1", label: "Duplicate Camera" },
      { kind: "audioinput", deviceId: "default", label: "" }
    ]);

    const { result } = renderHook(() => useVideoCapture());

    await waitFor(() => {
      expect(result.current.videoInputDevices).toHaveLength(2);
    });

    expect(result.current.videoInputDevices).toEqual([
      { deviceId: "", label: "System default camera" },
      { deviceId: "camera-1", label: "USB Camera" }
    ]);
    expect(result.current.audioInputDevices).toEqual([
      { deviceId: "", label: "System default input" }
    ]);
    expect(result.current.selectedVideoDeviceId).toBe("");
    expect(result.current.selectedAudioDeviceId).toBe("");
    expect(permissionStream.getTracks).toHaveBeenCalled();
  });

  it("starts and stops a preview stream", async () => {
    const previewStream = createMockStream();
    mockGetUserMedia.mockResolvedValue(previewStream);

    const { result } = renderHook(() =>
      useVideoCapture({ includeAudio: false, autoFetchDevices: false, warmupMs: 0 })
    );

    await act(async () => {
      await result.current.startPreview();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    expect(result.current.previewStream).toBe(previewStream);
    expect(result.current.isPreviewing).toBe(true);

    act(() => {
      result.current.stopPreview();
    });

    expect(result.current.previewStream).toBeNull();
    expect(result.current.isPreviewing).toBe(false);
    expect(previewStream.getTracks).toHaveBeenCalled();
  });

  it("uses the selected resolution when starting preview", async () => {
    const previewStream = createMockStream();
    mockGetUserMedia.mockResolvedValue(previewStream);

    const { result } = renderHook(() =>
      useVideoCapture({ includeAudio: false, autoFetchDevices: false, warmupMs: 0 })
    );

    act(() => {
      result.current.handleVideoResolutionChange("vga");
    });
    await act(async () => {
      await result.current.startPreview();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    expect(result.current.selectedVideoResolution).toBe("vga");
  });

  it("uses the initial camera settings when starting preview", async () => {
    const previewStream = createMockStream();
    mockGetUserMedia.mockResolvedValue(previewStream);

    const { result } = renderHook(() =>
      useVideoCapture({
        includeAudio: false,
        autoFetchDevices: false,
        initialVideoDeviceId: "camera-1",
        initialResolution: "wide480p",
        warmupMs: 0
      })
    );

    await act(async () => {
      await result.current.startPreview();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 832 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
        deviceId: { exact: "camera-1" }
      },
      audio: false
    });
  });

  it("restarts an active preview when the resolution changes", async () => {
    const firstStream = createMockStream();
    const secondStream = createMockStream();
    mockGetUserMedia
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream);

    const { result } = renderHook(() =>
      useVideoCapture({ includeAudio: false, autoFetchDevices: false, warmupMs: 0 })
    );

    await act(async () => {
      await result.current.startPreview();
    });
    await act(async () => {
      result.current.handleVideoResolutionChange("vga");
    });

    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    });
    expect(mockGetUserMedia).toHaveBeenLastCalledWith({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    expect(firstStream.getTracks()[0].stop).toHaveBeenCalled();
    expect(result.current.previewStream).toBe(secondStream);
  });

  it("supports a wide 480p capture preset for realtime video", async () => {
    const previewStream = createMockStream();
    mockGetUserMedia.mockResolvedValue(previewStream);

    const { result } = renderHook(() =>
      useVideoCapture({ includeAudio: false, autoFetchDevices: false, warmupMs: 0 })
    );

    act(() => {
      result.current.handleVideoResolutionChange("wide480p");
    });
    await act(async () => {
      await result.current.startPreview();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: {
        width: { ideal: 832 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
  });

  it("stores the actual selected video track settings", async () => {
    const previewStream = createMockStream();
    mockGetUserMedia.mockResolvedValue(previewStream);

    const { result } = renderHook(() =>
      useVideoCapture({ includeAudio: false, autoFetchDevices: false, warmupMs: 0 })
    );

    await act(async () => {
      await result.current.startPreview();
    });

    expect(result.current.videoTrackSettings).toEqual({
      width: 640,
      height: 480,
      frameRate: 30
    });
  });

  it("reports warm-up state before preview is ready", async () => {
    jest.useFakeTimers();
    const previewStream = createMockStream();
    mockGetUserMedia.mockResolvedValue(previewStream);

    const { result } = renderHook(() =>
      useVideoCapture({
        includeAudio: false,
        autoFetchDevices: false,
        warmupMs: 2000
      })
    );

    await act(async () => {
      await result.current.startPreview();
    });

    expect(result.current.isWarmingUp).toBe(true);
    expect(result.current.isPreviewReady).toBe(false);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.isWarmingUp).toBe(false);
    expect(result.current.isPreviewReady).toBe(true);
    jest.useRealTimers();
  });
});
