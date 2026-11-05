/**
 * The preview mounted audio-only, as DAW mode mounts it: no compositor, the
 * DAW transport strip instead of the control bar, and playback, loop,
 * metronome and tempo working through the real timeline stores.
 */

import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";

import { installGlobal } from "../../../../test-utils/doubles";
import mockTheme from "../../../../__mocks__/themeMock";
import {
  createTimelineInstance,
  TimelineProvider,
  type TimelineInstance
} from "../../../../stores/timeline/TimelineInstance";
import { useTimelineLayoutStore } from "../../../../stores/timeline/TimelineLayoutStore";
import { Metronome } from "../../daw/transport/metronome";
import { PreviewArea } from "../PreviewArea";

installGlobal("AudioContext", class AudioContext {});

jest.mock("../PreviewCompositor", () => ({
  PreviewCompositor: () => React.createElement("div", { "data-testid": "preview-compositor" })
}));

const mockGetAsset = jest.fn();
jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: Object.assign(
    (selector: (state: { get: typeof mockGetAsset }) => unknown) => selector({ get: mockGetAsset }),
    { getState: () => ({ queryClient: null }) }
  )
}));
const mockPlayGrain = jest.fn().mockResolvedValue(undefined);
const mockResume = jest.fn().mockResolvedValue(undefined);
jest.setTimeout(30_000);
// The clips were scheduled against context time 3.9; the context now reads 4.
const mockScheduleClips = jest.fn().mockResolvedValue(3.9);

// Other graph methods (mixer, devices) are no-ops here: the proxy answers any
// name the preview calls with a mock.
jest.mock("../AudioGraph", () => ({
  AudioGraph: class {
    constructor() {
      const known: Record<string, unknown> = {
        context: null,
        scheduleClips: mockScheduleClips,
        addClips: jest.fn().mockResolvedValue(undefined),
        playGrain: mockPlayGrain,
        getMasterAnalyser: () => null,
        getContext: () => ({
          resume: mockResume,
          suspend: jest.fn().mockResolvedValue(undefined),
          currentTime: 4,
          state: "running" as const,
          sampleRate: 48_000
        })
      };
      const fallbacks = new Map<string, jest.Mock>();
      return new Proxy(known, {
        get: (target, name: string) => {
          if (name in target) return target[name];
          if (!fallbacks.has(name)) fallbacks.set(name, jest.fn());
          return fallbacks.get(name);
        }
      });
    }
  }
}));

let instance: TimelineInstance;

const renderTransport = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider instance={instance}>
        <PreviewArea audioOnly fps={30} />
      </TimelineProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  useTimelineLayoutStore.setState({ metronomeEnabled: false });
  instance = createTimelineInstance();
  const track = makeTrack({ id: "t1", type: "audio", name: "Audio" });
  instance.doc.setState({
    tracks: [track],
    clips: [makeClip({ id: "c1", trackId: "t1", mediaType: "audio", startMs: 2000, durationMs: 3000 })]
  });
});

describe("PreviewArea audio-only (DAW transport)", () => {
  it("renders the transport and no compositor", () => {
    renderTransport();
    expect(screen.queryByTestId("preview-compositor")).not.toBeInTheDocument();
    expect(screen.getByTestId("daw-transport")).toBeInTheDocument();
    for (const name of ["Return to start", "Play", "Stop", "Loop", "Metronome", "Mute"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Bars, beats and ticks")).toHaveTextContent("1:1:000");
    expect(screen.getByLabelText("Timecode")).toHaveTextContent("00:00:00:00");
    expect(screen.getByRole("meter", { name: "Master level" })).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Scrub timeline" })).not.toBeInTheDocument();
  });

  it("loops the selected clip, and toggling off keeps the marks", async () => {
    act(() => useTimelineLayoutStore.getState().setLoopPlayback(false));
    renderTransport();
    act(() => instance.ui.getState().setSelection(["c1"]));
    await userEvent.click(screen.getByRole("button", { name: "Loop" }));
    expect(instance.playback.getState().rangeInMs).toBe(2000);
    expect(instance.playback.getState().rangeOutMs).toBe(5000);
    expect(useTimelineLayoutStore.getState().loopPlayback).toBe(true);
    expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "Loop" }));
    expect(useTimelineLayoutStore.getState().loopPlayback).toBe(false);
    expect(instance.playback.getState().rangeOutMs).toBe(5000);
    expect(screen.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "false");
  });

  it("starts the metronome on the audio clock when playing, even with nothing to hear", async () => {
    const start = jest.spyOn(Metronome.prototype, "start").mockImplementation(() => undefined);
    instance.doc.setState({ clips: [] });
    renderTransport();
    await userEvent.click(screen.getByRole("button", { name: "Metronome" }));
    expect(useTimelineLayoutStore.getState().metronomeEnabled).toBe(true);

    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    // The audio-clock branch ran although no clip sounds.
    expect(mockScheduleClips).toHaveBeenCalled();
    expect(start.mock.calls[0][0]).toMatchObject({ anchorMs: 0, anchorContextSec: 3.9, rate: 1 });
    act(() => instance.playback.getState().pause());
    start.mockRestore();
  });

  it("does not start the metronome when it is off", async () => {
    const start = jest.spyOn(Metronome.prototype, "start").mockImplementation(() => undefined);
    renderTransport();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    expect(start).not.toHaveBeenCalled();
    act(() => instance.playback.getState().pause());
    start.mockRestore();
  });

  it("sets the tempo from the BPM field", async () => {
    renderTransport();
    const bpm = screen.getByRole("spinbutton", { name: "Tempo in BPM" });
    await userEvent.clear(bpm);
    await userEvent.type(bpm, "90{Enter}");
    expect(instance.doc.getState().tempo?.bpm).toBe(90);
  });
});


describe("paused scrub destination", () => {
  function clips(): void {
    instance.doc.setState({ clips: [
      makeClip({ id: "a", currentAssetId: "a", status: "generated", trackId: "t1", mediaType: "audio", startMs: 0, durationMs: 2000 }),
      makeClip({ id: "b", currentAssetId: "b", status: "generated", trackId: "t1", mediaType: "audio", startMs: 4000, durationMs: 2000 })
    ] });
  }

  it("resolves B after the cursor leaves A during asset lookup", async () => {
    clips();
    let releaseA!: (asset: unknown) => void;
    mockGetAsset.mockImplementation((id: string) => id === "a"
      ? new Promise((resolve) => { releaseA = resolve; })
      : Promise.resolve({ get_url: "https://example.test/b.wav" }));
    const mounted = renderTransport();
    act(() => instance.playback.setState({ currentTimeMs: 1000 }));
    expect(mockGetAsset).toHaveBeenCalledWith("a");
    act(() => instance.playback.setState({ currentTimeMs: 5000 }));
    await act(async () => releaseA({ get_url: "https://example.test/a.wav" }));
    expect(mockGetAsset).toHaveBeenCalledWith("b");
    expect(mockPlayGrain).toHaveBeenCalledTimes(1);
    expect(mockPlayGrain.mock.calls[0][0].map((c: { clip: { id: string } }) => c.clip.id)).toEqual(["b"]);
    expect(mockPlayGrain.mock.calls[0][2]).toBe(5000);
    mounted.unmount();
  });

  it("retries the destination when movement invalidates decoding", async () => {
    clips();
    mockGetAsset.mockImplementation((id: string) => Promise.resolve({ get_url: `https://example.test/${id}.wav` }));
    let finishDecode!: () => void;
    mockPlayGrain.mockImplementationOnce(() => new Promise<void>((resolve) => { finishDecode = resolve; }));
    const mounted = renderTransport();
    await act(async () => instance.playback.setState({ currentTimeMs: 1000 }));
    expect(mockPlayGrain).toHaveBeenCalledTimes(1);
    act(() => instance.playback.setState({ currentTimeMs: 5000 }));
    expect(mockPlayGrain.mock.calls[0][3]()).toBe(true);
    await act(async () => finishDecode());
    expect(mockPlayGrain).toHaveBeenCalledTimes(2);
    expect(mockPlayGrain.mock.calls[1][2]).toBe(5000);
    expect(mockPlayGrain.mock.calls[1][0][0].clip.id).toBe("b");
    mounted.unmount();
  });

  it("invalidates decoding when the preview is disposed", async () => {
    clips();
    mockGetAsset.mockResolvedValue({ get_url: "https://example.test/a.wav" });
    let finishDecode!: () => void;
    mockPlayGrain.mockImplementationOnce(() => new Promise<void>((resolve) => { finishDecode = resolve; }));
    const mounted = renderTransport();
    await act(async () => instance.playback.setState({ currentTimeMs: 1000 }));
    const shouldCancel = mockPlayGrain.mock.calls[0][3];
    mounted.unmount();
    expect(shouldCancel()).toBe(true);
    await act(async () => finishDecode());
    expect(mockPlayGrain).toHaveBeenCalledTimes(1);
  });

  it("does not play or retry after disposal during lookup", async () => {
    clips();
    let release!: (asset: unknown) => void;
    mockGetAsset.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const mounted = renderTransport();
    act(() => instance.playback.setState({ currentTimeMs: 1000 }));
    act(() => instance.playback.setState({ currentTimeMs: 5000 }));
    mounted.unmount();
    await act(async () => release({ get_url: "https://example.test/a.wav" }));
    expect(mockPlayGrain).not.toHaveBeenCalled();
    expect(mockGetAsset).toHaveBeenCalledTimes(1);
  });
});
