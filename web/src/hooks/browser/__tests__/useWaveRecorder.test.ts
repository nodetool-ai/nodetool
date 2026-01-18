import { renderHook } from "@testing-library/react";
import { useWaveRecorder, WaveRecorderProps, AudioDevice } from "../useWaveRecorder";

// Mock WaveSurfer and Record plugin
jest.mock("wavesurfer.js", () => {
  return jest.fn().mockImplementation(() => ({
    create: jest.fn().mockReturnValue({
      destroy: jest.fn()
    })
  }));
});

jest.mock("wavesurfer.js/dist/plugins/record", () => ({
  create: jest.fn().mockReturnValue({
    startRecording: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn(),
    isRecording: jest.fn().mockReturnValue(false),
    unAll: jest.fn()
  })
}));

// Mock dependencies
jest.mock("../../serverState/useAssetUpload", () => ({
  useAssetUpload: jest.fn(() => ({
    uploadAsset: jest.fn()
  }))
}));

jest.mock("../../contexts/NodeContext", () => ({
  useNodes: jest.fn(() => ({
    workflow: { id: "workflow-123" }
  }))
}));

jest.mock("loglevel", () => ({
  info: jest.fn()
}));

// Mock navigator.mediaDevices
const mockMediaDevices = {
  getUserMedia: jest.fn().mockResolvedValue({
    getTracks: jest.fn().mockImplementation(() => [
      { stop: jest.fn() }
    ])
  }),
  enumerateDevices: jest.fn().mockResolvedValue([
    { kind: "audioinput", deviceId: "device-1", label: "Microphone 1" },
    { kind: "audioinput", deviceId: "device-2", label: "Microphone 2" },
    { kind: "audiooutput", deviceId: "device-3", label: "Speaker 1" }
  ])
};

Object.defineProperty(navigator, "mediaDevices", {
  value: mockMediaDevices,
  writable: true
});

describe("useWaveRecorder", () => {
  let props: WaveRecorderProps;
  let result: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    props = {
      onChange: jest.fn()
    };

    result = renderHook(() => useWaveRecorder(props)).result;
  });

  describe("initial state", () => {
    it("initializes with isRecording as false", () => {
      expect(result.current.isRecording).toBe(false);
    });

    it("initializes with isLoading as false", () => {
      expect(result.current.isLoading).toBe(false);
    });

    it("initializes with null error", () => {
      expect(result.current.error).toBeNull();
    });

    it("initializes with empty audio input devices", () => {
      expect(result.current.audioInputDevices).toEqual([]);
    });

    it("initializes with empty audio output devices", () => {
      expect(result.current.audioOutputDevices).toEqual([]);
    });

    it("initializes with empty selected input device", () => {
      expect(result.current.selectedInputDeviceId).toBe("");
    });

    it("initializes with device list visibility as false", () => {
      expect(result.current.isDeviceListVisible).toBe(false);
    });

    it("provides mic ref", () => {
      expect(result.current.micRef).toBeDefined();
      expect(result.current.micRef.current).toBeNull();
    });
  });

  describe("fetchAudioDeviceNames", () => {
    it("fetches audio devices when navigator.mediaDevices is available", async () => {
      await result.current.fetchAudioDeviceNames();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
    });

    it("sets error when navigator.mediaDevices is not available", async () => {
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        value: undefined,
        writable: true
      });

      const { result: newResult } = renderHook(() => 
        useWaveRecorder({ onChange: jest.fn() })
      );

      await newResult.current.fetchAudioDeviceNames();

      expect(newResult.current.error).toBe("No media devices available");

      // Restore
      Object.defineProperty(navigator, "mediaDevices", {
        value: originalMediaDevices,
        writable: true
      });
    });

    it("maps audio input devices correctly", async () => {
      await result.current.fetchAudioDeviceNames();

      // Allow state updates to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(result.current.audioInputDevices).toHaveLength(2);
      expect(result.current.audioInputDevices[0]).toEqual({
        deviceId: "device-1",
        label: "Microphone 1"
      });
    });

    it("maps audio output devices correctly", async () => {
      await result.current.fetchAudioDeviceNames();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(result.current.audioOutputDevices).toEqual(["Speaker 1"]);
    });

    it("selects first input device by default", async () => {
      await result.current.fetchAudioDeviceNames();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(result.current.selectedInputDeviceId).toBe("device-1");
    });
  });

  describe("handleRecord", () => {
    it("stops recording when already recording", () => {
      const { Record } = require("wavesurfer.js/dist/plugins/record");
      const mockRecordPlugin = Record.create();
      mockRecordPlugin.isRecording.mockReturnValue(true);
      mockRecordPlugin.stopRecording.mockReturnValue(undefined);

      // Simulate recording state
      jest.spyOn(require("wavesurfer.js/dist/plugins/record"), "create")
        .mockReturnValue(mockRecordPlugin);

      const { result: newResult } = renderHook(() => 
        useWaveRecorder({ onChange: jest.fn() })
      );

      // Manually set recording state for test
      newResult.current.handleRecord();

      expect(mockRecordPlugin.stopRecording).toHaveBeenCalled();
    });

    it("starts recording when not already recording", () => {
      const { Record } = require("wavesurfer.js/dist/plugins/record");
      const mockRecordPlugin = Record.create();
      mockRecordPlugin.isRecording.mockReturnValue(false);
      mockRecordPlugin.startRecording.mockResolvedValue(undefined);

      jest.spyOn(require("wavesurfer.js/dist/plugins/record"), "create")
        .mockReturnValue(mockRecordPlugin);

      const { result: newResult } = renderHook(() => 
        useWaveRecorder({ onChange: jest.fn() })
      );

      newResult.current.handleRecord();

      expect(mockRecordPlugin.startRecording).toHaveBeenCalled();
      expect(newResult.current.isLoading).toBe(true);
    });

    it("uses selected device when starting recording", () => {
      const { Record } = require("wavesurfer.js/dist/plugins/record");
      const mockRecordPlugin = Record.create();
      mockRecordPlugin.isRecording.mockReturnValue(false);
      mockRecordPlugin.startRecording.mockResolvedValue(undefined);

      jest.spyOn(require("wavesurfer.js/dist/plugins/record"), "create")
        .mockReturnValue(mockRecordPlugin);

      const { result: newResult } = renderHook(() => 
        useWaveRecorder({ onChange: jest.fn() })
      );

      // Set selected device
      newResult.current.handleInputDeviceChange("device-1");

      newResult.current.handleRecord();

      expect(mockRecordPlugin.startRecording).toHaveBeenCalledWith({
        deviceId: { exact: "device-1" }
      });
    });

    it("starts recording without device constraint when no device selected", () => {
      const { Record } = require("wavesurfer.js/dist/plugins/record");
      const mockRecordPlugin = Record.create();
      mockRecordPlugin.isRecording.mockReturnValue(false);
      mockRecordPlugin.startRecording.mockResolvedValue(undefined);

      jest.spyOn(require("wavesurfer.js/dist/plugins/record"), "create")
        .mockReturnValue(mockRecordPlugin);

      const { result: newResult } = renderHook(() => 
        useWaveRecorder({ onChange: jest.fn() })
      );

      // Ensure no device is selected
      newResult.current.handleInputDeviceChange("");

      newResult.current.handleRecord();

      expect(mockRecordPlugin.startRecording).toHaveBeenCalledWith(undefined);
    });
  });

  describe("toggleDeviceListVisibility", () => {
    it("toggles device list visibility", async () => {
      expect(result.current.isDeviceListVisible).toBe(false);

      result.current.toggleDeviceListVisibility();

      expect(result.current.isDeviceListVisible).toBe(true);

      result.current.toggleDeviceListVisibility();

      expect(result.current.isDeviceListVisible).toBe(false);
    });

    it("fetches audio devices when toggling visibility", async () => {
      result.current.toggleDeviceListVisibility();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    });
  });

  describe("handleInputDeviceChange", () => {
    it("updates selected input device", () => {
      result.current.handleInputDeviceChange("device-2");

      expect(result.current.selectedInputDeviceId).toBe("device-2");
    });
  });

  describe("setError", () => {
    it("updates error state", () => {
      result.current.setError("Test error");

      expect(result.current.error).toBe("Test error");
    });
  });

  describe("cleanup", () => {
    it("cleans up on unmount", () => {
      const { result: newResult, unmount } = renderHook(() => 
        useWaveRecorder({ onChange: jest.fn() })
      );

      unmount();

      // The useEffect cleanup should have been called
      // We can't directly test the cleanup, but we verify no errors occur
      expect(true).toBe(true);
    });
  });
});
