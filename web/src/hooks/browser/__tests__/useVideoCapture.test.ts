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
    stop: jest.fn()
  } as unknown as MediaStreamTrack;
};

const createMockStream = (): MediaStream => {
  const tracks = [createMockTrack()];
  return {
    getTracks: jest.fn(() => tracks)
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
      useVideoCapture({ includeAudio: false, autoFetchDevices: false })
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
      useVideoCapture({ includeAudio: false, autoFetchDevices: false })
    );

    await act(async () => {
      await result.current.startPreview();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      video: true,
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
});
