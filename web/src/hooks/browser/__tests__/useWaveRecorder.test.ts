/**
 * Tests for useWaveRecorder hook
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useWaveRecorder } from "../useWaveRecorder";

// Mock dependencies
jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: () => ({
    uploadAsset: jest.fn()
  })
}));

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: jest.fn(() => ({
    workflow: { id: "test-workflow-id" }
  }))
}));

jest.mock("wavesurfer.js", () => ({
  default: {
    create: jest.fn(() => ({
      on: jest.fn(),
      destroy: jest.fn()
    }))
  }
}));

jest.mock("wavesurfer.js/dist/plugins/record", () => ({
  default: {
    create: jest.fn(() => ({
      on: jest.fn(),
      unAll: jest.fn(),
      isRecording: jest.fn(() => false),
      startRecording: jest.fn(() => Promise.resolve()),
      stopRecording: jest.fn()
    }))
  }
}));


describe("useWaveRecorder", () => {
  let mockOnChange: jest.Mock;

  beforeEach(() => {
    mockOnChange = jest.fn();
    jest.clearAllMocks();
    
    // Mock navigator.mediaDevices
    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: jest.fn(() =>
          Promise.resolve({
            getTracks: () => [{ stop: jest.fn() }]
          })
        ),
        enumerateDevices: jest.fn(() =>
          Promise.resolve([
            { deviceId: "default", kind: "audioinput", label: "Default" },
            { deviceId: "device1", kind: "audioinput", label: "Microphone 1" },
            { deviceId: "device2", kind: "audiooutput", label: "Speakers" }
          ])
        )
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with default state", () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      expect(result.current.isRecording).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.isDeviceListVisible).toBe(false);
    });

    it("should return micRef", () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      expect(result.current.micRef).toBeDefined();
      expect(result.current.micRef.current).toBeNull();
    });

    it("should fetch audio devices on mount", async () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.audioInputDevices.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Device Enumeration", () => {
    it("should enumerate audio input devices", async () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.audioInputDevices.length).toBeGreaterThan(0);
      });
    });

    it("should handle devices without labels", async () => {
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true,
        value: {
          getUserMedia: jest.fn(() =>
            Promise.resolve({
              getTracks: () => [{ stop: jest.fn() }]
            })
          ),
          enumerateDevices: jest.fn(() =>
            Promise.resolve([
              { deviceId: "device1", kind: "audioinput", label: "" },
              { deviceId: "default", kind: "audioinput", label: "" }
            ])
          )
        }
      });

      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.audioInputDevices.length).toBeGreaterThan(0);
      });
    });

    it("should set error when no media devices available", async () => {
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true,
        value: undefined
      });

      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.error).toBe("No media devices available");
      });
    });

    it("should set error when device enumeration fails", async () => {
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true,
        value: {
          getUserMedia: jest.fn(() => Promise.reject(new Error("Permission denied"))),
          enumerateDevices: jest.fn(() => Promise.reject(new Error("Enumeration failed")))
        }
      });

      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.error).toContain("Error enumerating devices");
      });
    });

    it("should set error when no audio input devices found", async () => {
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true,
        value: {
          getUserMedia: jest.fn(() =>
            Promise.resolve({
              getTracks: () => [{ stop: jest.fn() }]
            })
          ),
          enumerateDevices: jest.fn(() =>
            Promise.resolve([
              { deviceId: "speaker1", kind: "audiooutput", label: "Speakers" }
            ])
          )
        }
      });

      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.error).toBe("No audio input devices found");
      }, { timeout: 3000 });
    });
  });

  describe("Device Selection", () => {
    it("should select first available device by default", async () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.selectedInputDeviceId).toBeDefined();
      });
    });

    it("should handle device selection change", async () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      await waitFor(() => {
        expect(result.current.audioInputDevices.length).toBeGreaterThan(0);
      });

      act(() => {
        result.current.handleInputDeviceChange("device1");
      });

      expect(result.current.selectedInputDeviceId).toBe("device1");
    });
  });

  describe("Device List Visibility", () => {
    it("should toggle device list visibility", async () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

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
  });

  describe("Recording", () => {
    it("should have handleRecord function", () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      expect(result.current.handleRecord).toBeDefined();
      expect(typeof result.current.handleRecord).toBe("function");
    });

    it("should not crash when handleRecord is called without WaveSurfer initialized", () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      expect(() => {
        act(() => {
          result.current.handleRecord();
        });
      }).not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should allow setting error manually", async () => {
      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      act(() => {
        result.current.setError("Test error");
      });

      expect(result.current.error).toBe("Test error");
    });

    it("should clear error when device enumeration succeeds", async () => {
      Object.defineProperty(navigator, "mediaDevices", {
        writable: true,
        value: {
          getUserMedia: jest.fn(() =>
            Promise.resolve({
              getTracks: () => [{ stop: jest.fn() }]
            })
          ),
          enumerateDevices: jest.fn(() =>
            Promise.resolve([
              { deviceId: "default", kind: "audioinput", label: "Default" }
            ])
          )
        }
      });

      const { result } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      // Set an error first
      act(() => {
        result.current.setError("Previous error");
      });

      // Trigger device list toggle which re-fetches devices
      act(() => {
        result.current.toggleDeviceListVisibility();
      });

      await waitFor(() => {
        expect(result.current.error).not.toBe("Previous error");
      });
    });
  });

  describe("Cleanup", () => {
    it("should cleanup on unmount", () => {
      const { unmount } = renderHook(() => useWaveRecorder({ onChange: mockOnChange }));

      expect(() => {
        unmount();
      }).not.toThrow();
    });
  });
});
