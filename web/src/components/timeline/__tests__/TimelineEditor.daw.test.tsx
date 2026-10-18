/**
 * DAW mode in the TimelineEditor shell: the TopBar switch and the keyboard
 * toggle swap the preview for the transport strip, give the tracks the room
 * and open the bottom dock; Video mode stays as it was.
 */

import React from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeSequence } from "@nodetool-ai/timeline";
import mockTheme from "../../../__mocks__/themeMock";
import { TimelineEditor } from "../TimelineEditor";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { useTimelineLayoutStore } from "../../../stores/timeline/TimelineLayoutStore";
import {
  AssetGridStoreProvider,
  LIBRARY_ASSET_GRID_STORE_KEY
} from "../../../stores/AssetGridStore";

// ── Router mocks ────────────────────────────────────────────────────────────

// The dock keeps every panel mounted. The Assistant's composer and the version
// history query through TanStack Query, which these shell tests do not provide.
jest.mock("../TimelineVersionHistoryPanel", () => ({
  __esModule: true,
  default: () =>
    React.createElement("div", { "data-testid": "history-panel" }, "History")
}));
jest.mock("../TimelineAgentPanel", () => ({
  __esModule: true,
  default: () =>
    React.createElement("div", { "data-testid": "assistant-panel" }, "Assistant")
}));

jest.mock("react-router-dom", () => ({
  useParams: jest.fn(),
  useNavigate: jest.fn(),
  useSearchParams: jest.fn()
}));

// ── Data hook mock ───────────────────────────────────────────────────────────

jest.mock("../../../hooks/useTimelineSequence", () => ({
  useTimeline: jest.fn(),
  useTimelines: jest.fn(),
  useCreateTimeline: jest.fn()
}));
jest.mock("../../../hooks/timeline/useWorkflowFreshnessCheck", () => ({
  useWorkflowFreshnessCheck: jest.fn()
}));
jest.mock("../../../hooks/timeline/useGenerateClip", () => ({
  useTimelineGenerationSubscriptions: jest.fn()
}));
jest.mock("../../../hooks/timeline/useLoadTimelineIntoStore", () => ({
  useLoadTimelineIntoStore: jest.fn()
}));
jest.mock("../../../hooks/timeline/useTimelineAutosave", () => ({
  useTimelineAutosave: jest.fn()
}));
jest.mock("../../../utils/timelineBundle", () => ({
  exportTimelineMedia: jest.fn(),
  exportTimelinePremiere: jest.fn(),
  exportTimelineZip: jest.fn()
}));
jest.mock("../../../stores/timeline/TimelineGenerationStore", () => ({
  useGeneratingCount: jest.fn(() => 0),
  useFailedCount: jest.fn(() => 0),
  useGeneratingClipIds: jest.fn(() => []),
  useFailedClipIds: jest.fn(() => [])
}));

// ── TracksRegion mock ────────────────────────────────────────────────────────

jest.mock("../Tracks/TracksRegion", () => ({
  TracksRegion: ({ heightPx }: { heightPx: number }) =>
    React.createElement("div", { "data-testid": "tracks-region", style: { height: heightPx } }, "Tracks")
}));

// ── PreviewArea mock ─────────────────────────────────────────────────────────

// The audio-only form is the DAW transport: the mock reports which form the
// editor asked for, so the layout can be checked without an audio graph.
jest.mock("../preview/PreviewArea", () => ({
  PreviewArea: ({ audioOnly }: { audioOnly?: boolean }) =>
    React.createElement(
      "div",
      { "data-testid": "preview-area", "data-audio-only": audioOnly ? "true" : "false" },
      audioOnly ? "Transport" : "Preview"
    )
}));

// The dock's tab bodies are other features with their own tests.
jest.mock("../daw/mixer/MixerView", () => ({
  MixerView: () => React.createElement("div", { "data-testid": "mixer-view" }, "Mixer view")
}));
jest.mock("../daw/harmony/HarmonyPanel", () => ({
  HarmonyPanel: () => React.createElement("div", { "data-testid": "harmony-panel" }, "Harmony")
}));
jest.mock("../daw/dock/DeviceChainView", () => ({
  isDeviceTrack: (track: { type: string }) => track.type === "audio" || track.type === "midi",
  DeviceChainView: ({ target }: { target: { kind: string; trackId?: string } | null }) =>
    React.createElement(
      "div",
      { "data-testid": "device-chain", "data-target": target?.kind === "track" ? target.trackId : target?.kind ?? "none" },
      "Devices"
    )
}));
jest.mock("../pianoRoll/PianoRollPanel", () => ({
  PianoRollPanel: ({ docked }: { docked?: boolean }) =>
    React.createElement("div", { "data-testid": "piano-roll-panel", "data-docked": docked ? "true" : "false" })
}));

// The Generate dialog's form pulls in the model pickers, which call TanStack
// Query. The editor shell tests don't render a QueryClientProvider, so swap
// it for a no-op.
jest.mock("../TimelineGeneratePanel", () => ({
  TimelineGeneratePanel: () =>
    React.createElement("div", { "data-testid": "topbar-prompt" }, "Prompt")
}));

// TranscriptPanel's VoiceCard embeds TTSModelSelect, which queries the TTS
// model list via TanStack Query. Same no-QueryClient constraint as above.
jest.mock("../../properties/TTSModelSelect", () => ({
  __esModule: true,
  default: () =>
    React.createElement("div", { "data-testid": "tts-model-select" }, "TTS")
}));

// The "Save as Asset" folder chooser uses useFolderTree (TanStack Query); no-op
// it for the same no-QueryClientProvider reason as above.
jest.mock("../../assets/SaveToFolderMenu", () => ({
  __esModule: true,
  default: () => null
}));

// `TopBar`'s Code button and the inspector tab list both read whether the
// timeline has embedded code via TanStack Query. Same no-QueryClientProvider
// reason as above — these editor shell tests don't render one.
jest.mock("../../../serverState/useTimelineCode", () => ({
  useTimelineHasCode: jest.fn(() => false)
}));

import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  useTimeline,
  useTimelines,
  useCreateTimeline
} from "../../../hooks/useTimelineSequence";
import { useTimelineAutosave } from "../../../hooks/timeline/useTimelineAutosave";

const renderEditor = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AssetGridStoreProvider persistKey={LIBRARY_ASSET_GRID_STORE_KEY}>
        <TimelineEditor />
      </AssetGridStoreProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  useTimelineLayoutStore.setState({ dawMode: false, dawDockTab: "mixer", metronomeEnabled: false });
  (useParams as jest.Mock).mockReturnValue({ sequenceId: "seq-1" });
  (useNavigate as jest.Mock).mockReturnValue(jest.fn());
  (useSearchParams as jest.Mock).mockReturnValue([new URLSearchParams(), jest.fn()]);
  (useTimelineAutosave as jest.Mock).mockReturnValue({ flush: jest.fn() });
  (useTimelines as jest.Mock).mockReturnValue({ data: [] });
  (useCreateTimeline as jest.Mock).mockReturnValue({
    mutate: jest.fn(),
    reset: jest.fn(),
    isPending: false,
    error: null
  });
  (useTimeline as jest.Mock).mockReturnValue({
    data: makeSequence({ id: "seq-1", name: "Song" }),
    isLoading: false,
    isError: false,
    refetch: jest.fn()
  });
});

describe("TimelineEditor DAW mode", () => {
  it("keeps the video layout by default", () => {
    renderEditor();
    expect(screen.getByTestId("preview-area")).toHaveAttribute("data-audio-only", "false");
    expect(screen.queryByTestId("daw-dock")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Video layout" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches to DAW mode from the TopBar: transport instead of the preview, and the dock", async () => {
    renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "DAW mode" }));

    expect(useTimelineLayoutStore.getState().dawMode).toBe(true);
    // One preview, mounted audio-only: playback keeps its graph and clock.
    const previews = screen.getAllByTestId("preview-area");
    expect(previews).toHaveLength(1);
    expect(previews[0]).toHaveAttribute("data-audio-only", "true");
    expect(screen.queryByText("Preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("daw-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("tracks-region")).toBeInTheDocument();

    const dock = screen.getByTestId("daw-dock");
    for (const name of ["Mixer", "Devices", "Piano roll", "Harmony"]) {
      expect(within(dock).getByRole("tab", { name })).toBeInTheDocument();
    }
    expect(within(dock).getByTestId("mixer-view")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "Resize DAW dock" })).toBeInTheDocument();
  });

  it("reads the ruler in bars while in DAW mode and restores it after", async () => {
    renderEditor();
    expect(useTimelineUIStore.getState().rulerMode).toBe("timecode");
    await userEvent.click(screen.getByRole("button", { name: "DAW mode" }));
    expect(useTimelineUIStore.getState().rulerMode).toBe("bars");
    await userEvent.click(screen.getByRole("button", { name: "Video layout" }));
    expect(useTimelineUIStore.getState().rulerMode).toBe("timecode");
    expect(screen.getByTestId("preview-area")).toHaveAttribute("data-audio-only", "false");
    expect(screen.queryByTestId("daw-dock")).not.toBeInTheDocument();
  });

  it("follows the layout store toggle that Alt+M runs", () => {
    renderEditor();
    act(() => useTimelineLayoutStore.getState().toggleDawMode());
    expect(screen.getByTestId("daw-dock")).toBeInTheDocument();
    act(() => useTimelineLayoutStore.getState().toggleDawMode());
    expect(screen.queryByTestId("daw-dock")).not.toBeInTheDocument();
  });

  it("opens the Piano roll tab when a midi clip is opened, and Devices on a track's instrument", () => {
    useTimelineLayoutStore.setState({ dawMode: true });
    renderEditor();
    const dock = screen.getByTestId("daw-dock");

    act(() => useTimelineStore.getState().addTrack("midi", "Keys"));
    const trackId = useTimelineStore.getState().tracks.find((t) => t.type === "midi")!.id;
    act(() => {
      useTimelineStore.setState({
        clips: [makeClip({ id: "clip-1", trackId, mediaType: "midi", notes: [], startMs: 0, durationMs: 2000 })]
      });
    });
    act(() => useTimelineUIStore.getState().openPianoRoll("clip-1"));
    expect(within(dock).getByRole("tab", { name: "Piano roll" })).toHaveAttribute("aria-selected", "true");
    expect(within(dock).getByTestId("piano-roll-panel")).toHaveAttribute("data-docked", "true");

    act(() => useTimelineUIStore.getState().toggleExpandedInstrument(trackId));
    expect(within(dock).getByRole("tab", { name: "Devices" })).toHaveAttribute("aria-selected", "true");
    expect(within(dock).getByTestId("device-chain")).toHaveAttribute("data-target", trackId);
  });
});
