import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { makeClip, makeTrack, type TimelineClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { DirectGenClipPanel } from "../DirectGenClipPanel";

jest.mock("../../../../hooks/timeline/useGenerateClip", () => ({
  useGenerateClip: () => ({
    generateClip: jest.fn(),
    cancelClipGeneration: jest.fn(),
    isActive: false,
    isFailed: false,
    canGenerate: false
  })
}));
jest.mock("../../../../hooks/timeline/useClipCostEstimate", () => ({
  useClipCostEstimate: () => null
}));
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useMediaOptions: () => ({ data: { durations: [4, 8] } })
}));
jest.mock("../../../properties/VideoModelSelect", () => () => null);
jest.mock("../../../properties/ImageModelSelect", () => () => null);
jest.mock("../../../properties/MusicModelSelect", () => () => null);
jest.mock("../../../properties/TTSModelSelect", () => () => null);
jest.mock("../../../costs/CostEstimateLine", () => () => null);
jest.mock("../ClipVersionHistory", () => ({ ClipVersionHistory: () => null }));
jest.mock("../ClipAdjustments", () => ({ ClipAdjustments: () => null }));
jest.mock("../GeneratedClipTopBar", () => ({ GeneratedClipTopBar: () => null }));
jest.mock("../../../chat/composer/MediaSettingChips", () => ({
  MediaOptionChip: (props: {
    header: string;
    disabled?: boolean;
    onChange: (value: number) => void;
  }) =>
    props.header === "Duration" ? (
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => props.onChange(8)}
      >
        Duration 8
      </button>
    ) : null,
  MediaAspectChip: () => null
}));

const videoTrack = makeTrack({ type: "video", name: "V1" });
const audioTrack = makeTrack({ type: "audio", name: "A1" });

function seed(overrides: Partial<TimelineClip> = {}) {
  const clip = makeClip({
    id: "clip_gen",
    trackId: videoTrack.id,
    mediaType: "video",
    sourceType: "generated",
    bindingKind: "text-to-video",
    provider: "fal",
    model: "video-model",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    outPointMs: 4000,
    linkId: "link_1",
    ...overrides
  });
  const partner = makeClip({
    id: "clip_partner",
    trackId: audioTrack.id,
    mediaType: "audio",
    sourceType: "imported",
    startMs: 0,
    durationMs: 4000,
    inPointMs: 0,
    outPointMs: 4000,
    linkId: "link_1"
  });
  act(() => {
    useTimelineStore.setState({
      tracks: [videoTrack, audioTrack],
      clips: [clip, partner],
      linkedSelection: true
    });
  });
}

const clipById = (id: string) =>
  useTimelineStore.getState().clips.find((clip) => clip.id === id)!;

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <DirectGenClipPanel clipId="clip_gen" />
      </QueryClientProvider>
    </ThemeProvider>
  );

beforeEach(() => {
  localStorage.clear();
});

describe("DirectGenClipPanel duration", () => {
  it("resizes the clip, its out-point and its linked partner together", () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Duration 8" }));

    expect(clipById("clip_gen")).toMatchObject({
      durationMs: 8000,
      outPointMs: 8000
    });
    expect(clipById("clip_partner").durationMs).toBe(8000);
  });

  it("disables the duration on a locked clip", () => {
    seed({ locked: true });
    renderPanel();

    expect(screen.getByRole("button", { name: "Duration 8" })).toBeDisabled();
  });
});
