import { act, renderHook } from "@testing-library/react";
import { useVideoRecorder } from "../useVideoRecorder";

// The hook takes the workflow id as a prop, so nothing here mounts a
// NodeProvider — a published mini app has none, and the hook must still work.
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: jest.fn()
  })
}));
// Mock navigator.mediaDevices
const mockGetUserMedia = jest.fn();
const mockEnumerateDevices = jest.fn();

Object.defineProperty(global.navigator, "mediaDevices", {
  value: {
    getUserMedia: mockGetUserMedia,
    enumerateDevices: mockEnumerateDevices
  },
  writable: true
});

describe("useVideoRecorder", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMedia.mockReset();
    mockEnumerateDevices.mockReset();
  });

  it("initializes with default state", () => {
    // Mock getUserMedia to reject to avoid hanging
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isPreviewing).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isDeviceListVisible).toBe(false);
    expect(result.current.videoInputDevices).toEqual([]);
    expect(result.current.audioInputDevices).toEqual([]);
    expect(result.current.selectedVideoDeviceId).toBe("");
    expect(result.current.selectedAudioDeviceId).toBe("");
  });

  it("provides handleRecord function", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    expect(result.current.handleRecord).toEqual(expect.any(Function));
  });

  it("provides startPreview function", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    expect(result.current.startPreview).toEqual(expect.any(Function));
  });

  it("provides stopStream function", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    expect(result.current.stopStream).toEqual(expect.any(Function));
  });

  it("toggles device list visibility", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    expect(result.current.isDeviceListVisible).toBe(false);

    act(() => {
      result.current.toggleDeviceListVisibility();
    });

    expect(result.current.isDeviceListVisible).toBe(true);

    act(() => {
      result.current.toggleDeviceListVisibility();
    });

    expect(result.current.isDeviceListVisible).toBe(false);
  });

  it("handles video device change", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    act(() => {
      result.current.handleVideoDeviceChange("test-video-device-id");
    });

    expect(result.current.selectedVideoDeviceId).toBe("test-video-device-id");
  });

  it("handles audio device change", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    act(() => {
      result.current.handleAudioDeviceChange("test-audio-device-id");
    });

    expect(result.current.selectedAudioDeviceId).toBe("test-audio-device-id");
  });

  it("sets error when no stream available and trying to record", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    act(() => {
      result.current.handleRecord();
    });

    expect(result.current.error).toBe(
      "No video stream available. Start preview first."
    );
  });

  it("provides videoRef for video element attachment", () => {
    mockGetUserMedia.mockRejectedValue(new Error("Mock rejection"));

    const { result } = renderHook(() =>
      useVideoRecorder({ onChange: mockOnChange })
    );

    expect(result.current.videoRef).toBeDefined();
    expect(result.current.videoRef.current).toBeNull();
  });
});
