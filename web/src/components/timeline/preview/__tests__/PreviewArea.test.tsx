import React from "react";
import { installGlobal } from "../../../../test-utils/doubles";
import { act, render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

installGlobal("AudioContext", class AudioContext {});

jest.mock("../PreviewCompositor", () => ({
  PreviewCompositor: () =>
    React.createElement("div", { "data-testid": "preview-compositor" })
}));

const mockScheduleClips = jest.fn().mockResolvedValue(undefined);
const mockAddClips = jest.fn().mockResolvedValue(undefined);
const mockStopClips = jest.fn();

jest.mock("../AudioGraph", () => {
  return {
    AudioGraph: class {
      ensureClip = jest.fn();
      schedulePlayback = jest.fn();
      stop = jest.fn();
      stopAll = jest.fn();
      suspend = jest.fn();
      resume = jest.fn();
      playFrom = jest.fn();
      scheduleClips = mockScheduleClips;
      addClips = mockAddClips;
      stopClips = mockStopClips;
      scheduleClipsAt = jest.fn();
      seek = jest.fn();
      setMasterVolume = jest.fn();
      dispose = jest.fn();
      ensureClipBuffer = jest.fn().mockResolvedValue(undefined);
      getContext = () => ({
        resume: jest.fn().mockResolvedValue(undefined),
        suspend: jest.fn().mockResolvedValue(undefined),
        currentTime: 0,
        state: "suspended" as const,
        sampleRate: 48_000,
        createBuffer: (_channels: number, length: number) => ({
          getChannelData: () => new Float32Array(length)
        })
      });
    }
  };
});

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockStop = jest.fn();
const mockSetCurrentTimeMs = jest.fn();
const mockSeek = jest.fn();
const mockSetRate = jest.fn();
const mockSetTimeMs = jest.fn();
const mockSubscribeTime = jest.fn(() => () => {});

let mockCurrentTimeMs = 0;
let mockIsPlaying = false;
let mockDurationMs = 60_000;
let mockClips: unknown[] = [];
const mockTimelineListeners = new Set<() => void>();

function setMockClips(clips: unknown[]) {
  mockClips = clips;
  for (const listener of mockTimelineListeners) listener();
}

jest.mock("../../../../stores/timeline/TimelinePlaybackStore", () => {
  const getState = () => ({
    currentTimeMs: mockCurrentTimeMs,
    isPlaying: mockIsPlaying,
    play: mockPlay,
    pause: mockPause,
    stop: mockStop,
    setCurrentTimeMs: mockSetCurrentTimeMs,
    seek: mockSeek,
    setRate: mockSetRate,
    rate: 1,
    seekNonce: 0,
    setTimeMs: mockSetTimeMs,
    getTimeMs: () => mockCurrentTimeMs,
    subscribeTime: mockSubscribeTime
  });
  const useTimelinePlaybackStore = <T,>(
    selector: (s: ReturnType<typeof getState>) => T
  ) => {
    const state = getState();
    return selector ? selector(state) : state;
  };
  useTimelinePlaybackStore.getState = getState;
  return {
    useTimelinePlaybackStore,
    useTimelinePlaybackStoreApi: () => ({ getState })
  };
});

jest.mock("../../../../stores/timeline/TimelineStore", () => {
  const getState = () => ({
    clips: mockClips,
    tracks: [] as unknown[],
    durationMs: mockDurationMs
  });
  const useTimelineStore = <T,>(
    selector: (s: ReturnType<typeof getState>) => T
  ) => {
    const state = getState();
    return selector ? selector(state) : state;
  };
  useTimelineStore.getState = getState;
  return {
    useTimelineStore,
    useTimelineStoreApi: () => ({
      getState,
      subscribe: (listener: () => void) => {
        mockTimelineListeners.add(listener);
        return () => mockTimelineListeners.delete(listener);
      }
    })
  };
});

let mockMatteViewEnabled = false;
let mockSelectedClipIds = new Set<string>();
const mockToggleMatteView = jest.fn();

jest.mock("../../../../stores/timeline/TimelineUIStore", () => {
  const getState = () => ({
    matteViewEnabled: mockMatteViewEnabled,
    toggleMatteView: mockToggleMatteView,
    selectedClipIds: mockSelectedClipIds
  });
  const useTimelineUIStore = <T,>(
    selector: (s: ReturnType<typeof getState>) => T
  ) => {
    const state = getState();
    return selector ? selector(state) : state;
  };
  useTimelineUIStore.getState = getState;
  return { useTimelineUIStore };
});

jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: <T,>(selector: (s: { get: jest.Mock }) => T) => {
    const state = {
      get: jest.fn().mockResolvedValue(null)
    };
    return selector ? selector(state) : state;
  }
}));

import { PreviewArea } from "../PreviewArea";

const renderPreview = (props = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <PreviewArea fps={30} {...props} />
    </ThemeProvider>
  );

describe("PreviewArea", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockScheduleClips.mockResolvedValue(undefined);
    mockAddClips.mockResolvedValue(undefined);
    mockCurrentTimeMs = 0;
    mockIsPlaying = false;
    mockDurationMs = 60_000;
    mockClips = [];
    mockTimelineListeners.clear();
    mockMatteViewEnabled = false;
    mockSelectedClipIds = new Set<string>();
  });

  describe("show matte", () => {
    const mattedClip = (status: "ready" | "generating") => ({
      id: "shot",
      startMs: 0,
      durationMs: 4000,
      generatedMatte: { assetId: "mask-1", status }
    });

    it("is offered only once the selected clip's matte is ready", () => {
      mockClips = [mattedClip("generating")];
      mockSelectedClipIds = new Set(["shot"]);
      renderPreview();
      expect(screen.getByRole("button", { name: /show matte/i })).toBeDisabled();
    });

    it("toggles the view for a clip that has one", async () => {
      mockClips = [mattedClip("ready")];
      mockSelectedClipIds = new Set(["shot"]);
      renderPreview();

      const toggle = screen.getByRole("button", { name: /show matte/i });
      expect(toggle).toBeEnabled();
      fireEvent.click(toggle);
      expect(mockToggleMatteView).toHaveBeenCalledTimes(1);
    });

    it("is not offered with nothing selected", () => {
      renderPreview();
      expect(screen.getByRole("button", { name: /show matte/i })).toBeDisabled();
    });
  });

  describe("rendering", () => {
    it("renders the compositor", () => {
      renderPreview();
      expect(screen.getByTestId("preview-compositor")).toBeInTheDocument();
    });

    it("renders transport control buttons", () => {
      renderPreview();
      expect(
        screen.getByRole("button", { name: /play/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /stop/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /step back/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /step forward/i })
      ).toBeInTheDocument();
    });

    it("shows initial timecode 00:00:00:00", () => {
      renderPreview();
      expect(screen.getByText("00:00:00:00")).toBeInTheDocument();
    });

    it("shows the FPS readout", () => {
      renderPreview({ fps: 24 });
      expect(screen.getByText("24 fps")).toBeInTheDocument();
    });

    it("shows 30 fps by default", () => {
      renderPreview();
      expect(screen.getByText("30 fps")).toBeInTheDocument();
    });

    it("hides duration and fps when those readouts are off", () => {
      renderPreview({ showDuration: false, showFps: false });
      expect(screen.getByText("00:00:00:00")).toBeInTheDocument();
      expect(screen.queryByText("/00:01:00:00")).not.toBeInTheDocument();
      expect(screen.queryByText("30 fps")).not.toBeInTheDocument();
    });
  });

  describe("play button state", () => {
    it("shows Play button when not playing", () => {
      mockIsPlaying = false;
      renderPreview();
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("shows Pause button when playing", () => {
      mockIsPlaying = true;
      renderPreview();
      expect(
        screen.getByRole("button", { name: "Pause" })
      ).toBeInTheDocument();
    });
  });

  describe("keyboard shortcuts", () => {
    it("calls stop on Home key", () => {
      mockIsPlaying = true;
      renderPreview();
      fireEvent.keyDown(screen.getByTestId("preview-area"), { key: "Home" });
      expect(mockStop).toHaveBeenCalled();
    });

    it("stops and resets on End key", () => {
      mockIsPlaying = true;
      renderPreview();
      fireEvent.keyDown(screen.getByTestId("preview-area"), { key: "End" });
      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe("transport buttons", () => {
    it("calls stop when Stop button is clicked", () => {
      renderPreview();
      fireEvent.click(screen.getByRole("button", { name: /stop/i }));
      expect(mockStop).toHaveBeenCalled();
    });

    it("step-back button is disabled when playing", () => {
      mockIsPlaying = true;
      renderPreview();
      const stepBack = screen.getByRole("button", { name: /step back one frame/i });
      expect(stepBack).toBeDisabled();
    });

    it("step-forward button is disabled when playing", () => {
      mockIsPlaying = true;
      renderPreview();
      const stepFwd = screen.getByRole("button", { name: /step forward one frame/i });
      expect(stepFwd).toBeDisabled();
    });

    it("step-back button is enabled when paused", () => {
      mockIsPlaying = false;
      renderPreview();
      const stepBack = screen.getByRole("button", { name: /step back one frame/i });
      expect(stepBack).not.toBeDisabled();
    });

    it("does not navigate to a stale stored duration boundary", () => {
      mockDurationMs = 60_000;
      mockClips = [{ id: "clip", startMs: 0, durationMs: 10_000 }];
      renderPreview();
      fireEvent.click(
        screen.getByRole("button", { name: "Next clip boundary" })
      );
      expect(mockSetCurrentTimeMs).toHaveBeenCalledWith(10_000);
    });

    it("refreshes a playing MIDI clip after mix controls change", async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const midiClip = {
        id: "midi-1",
        trackId: "midi-track",
        name: "MIDI",
        mediaType: "midi",
        sourceType: "imported",
        status: "generated",
        startMs: 0,
        durationMs: 10_000,
        notes: [
          {
            id: "n1",
            startTick: 0,
            durationTicks: 960,
            pitch: 60,
            velocity: 100
          }
        ]
      };
      mockClips = [midiClip];
      renderPreview();

      await user.click(screen.getByRole("button", { name: "Play" }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockScheduleClips).toHaveBeenCalledTimes(1);

      await act(async () => {
        setMockClips([{ ...midiClip, volumeDb: -6 }]);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockStopClips).toHaveBeenLastCalledWith(["midi-1"]);
      expect(mockAddClips).toHaveBeenCalledTimes(1);

      mockStopClips.mockClear();
      mockAddClips.mockClear();
      await act(async () => {
        setMockClips([{ ...midiClip, volumeDb: -6, muted: true }]);
        await Promise.resolve();
      });
      expect(mockStopClips).toHaveBeenCalledWith(["midi-1"]);
      expect(mockAddClips).not.toHaveBeenCalled();
    });

    it("schedules MIDI immediately when it is unmuted during playback", async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const midiClip = {
        id: "midi-muted",
        trackId: "midi-track",
        name: "Muted MIDI",
        mediaType: "midi",
        sourceType: "imported",
        startMs: 0,
        durationMs: 10_000,
        muted: true,
        notes: [
          {
            id: "n1",
            startTick: 0,
            durationTicks: 960,
            pitch: 60,
            velocity: 100
          }
        ]
      };
      mockClips = [midiClip];
      renderPreview();

      await user.click(screen.getByRole("button", { name: "Play" }));
      expect(mockScheduleClips).not.toHaveBeenCalled();

      await act(async () => {
        setMockClips([{ ...midiClip, muted: false }]);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockAddClips).toHaveBeenCalledTimes(1);
    });

    it("serializes rapid MIDI refreshes so the newest mix is installed last", async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const midiClip = {
        id: "midi-rapid",
        trackId: "midi-track",
        name: "MIDI",
        mediaType: "midi",
        sourceType: "imported",
        startMs: 0,
        durationMs: 10_000,
        notes: [
          {
            id: "n1",
            startTick: 0,
            durationTicks: 960,
            pitch: 60,
            velocity: 100
          }
        ]
      };
      mockClips = [midiClip];
      renderPreview();
      await user.click(screen.getByRole("button", { name: "Play" }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      let finishFirstRefresh!: () => void;
      mockAddClips.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirstRefresh = resolve;
          })
      );

      await act(async () => {
        setMockClips([{ ...midiClip, volumeDb: -3 }]);
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockAddClips).toHaveBeenCalledTimes(1);

      await act(async () => {
        setMockClips([{ ...midiClip, volumeDb: -9 }]);
        await Promise.resolve();
      });
      expect(mockAddClips).toHaveBeenCalledTimes(1);

      await act(async () => {
        finishFirstRefresh();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockAddClips).toHaveBeenCalledTimes(2);
      expect(mockAddClips.mock.calls[1][0][0].clip.volumeDb).toBe(-9);
    });

    it("reconciles MIDI edits made while initial scheduling is pending", async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const midiClip = {
        id: "midi-starting",
        trackId: "midi-track",
        name: "MIDI",
        mediaType: "midi",
        sourceType: "imported",
        startMs: 0,
        durationMs: 10_000,
        notes: [
          {
            id: "n1",
            startTick: 0,
            durationTicks: 960,
            pitch: 60,
            velocity: 100
          }
        ]
      };
      let finishInitialSchedule!: () => void;
      mockScheduleClips.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishInitialSchedule = resolve;
          })
      );
      mockClips = [midiClip];
      renderPreview();

      await user.click(screen.getByRole("button", { name: "Play" }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockScheduleClips).toHaveBeenCalledTimes(1);

      await act(async () => {
        setMockClips([{ ...midiClip, volumeDb: -12 }]);
        finishInitialSchedule();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockStopClips).toHaveBeenCalledWith(["midi-starting"]);
      expect(mockAddClips).toHaveBeenCalledTimes(1);
      expect(mockAddClips.mock.calls[0][0][0].clip.volumeDb).toBe(-12);
    });
  });

  describe("timecode formatting", () => {
    it("formats 1.5 seconds as 00:00:01:15 at 30 fps", () => {
      mockCurrentTimeMs = 1500;
      renderPreview({ fps: 30 });
      // 1.5s at 30fps = frame 45 → 00:00:01:15
      expect(screen.getByText("00:00:01:15")).toBeInTheDocument();
    });

    it("formats 60 seconds as 00:01:00:00 at 30 fps", () => {
      mockCurrentTimeMs = 60_000;
      renderPreview({ fps: 30 });
      expect(screen.getByText("00:01:00:00")).toBeInTheDocument();
    });

    it("shows the live clip extent when the stored duration is stale", () => {
      mockDurationMs = 60_000;
      mockClips = [
        { id: "clip", startMs: 0, durationMs: 10_000 }
      ];
      renderPreview();
      expect(screen.getByText("/00:00:10:00")).toBeInTheDocument();
    });

    it("uses the same rounded frame as the playhead at fractional frames", () => {
      mockCurrentTimeMs = 4825;
      renderPreview({ fps: 30 });
      expect(screen.getByText("00:00:04:25")).toBeInTheDocument();
    });
  });
});
