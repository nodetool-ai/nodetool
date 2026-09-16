import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { createMediaEditRequest } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import AIEditClipPanel, { getMediaEditEligibility } from "../AIEditClipPanel";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useDirectGenPendingStore } from "../../../../hooks/timeline/directGenPending";

const mockUseVideoModelsByProvider = jest.fn();
const mockStartEdit = jest.fn<() => Promise<string | null>>();
const mockCancel = jest.fn<() => void>();

jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => mockUseVideoModelsByProvider()
}));

jest.mock("../../../../hooks/timeline/useTimelineDirectGenJob", () => ({
  useTimelineDirectGenJob: () => ({
    startEdit: mockStartEdit,
    cancel: mockCancel
  })
}));

jest.mock("../../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: ({ value }: { value: string }) => (
    <div data-testid="video-edit-model">{value}</div>
  )
}));

const compatibleModel = {
  type: "video_model",
  id: "edit-model",
  name: "Edit model",
  provider: "provider-a",
  supported_tasks: ["video_to_video"],
  resolutions: ["720p"]
};

const makeVideoClip = (
  overrides: Partial<TimelineClip> = {}
): TimelineClip => {
  const track = makeTrack({ type: "video", name: "V1" });
  return makeClip({
    id: "clip-1",
    trackId: track.id,
    name: "Source",
    mediaType: "video",
    sourceType: "imported",
    currentAssetId: "asset-1",
    startMs: 1000,
    durationMs: 4000,
    ...overrides
  });
};

const renderPanel = (clip: TimelineClip) => {
  act(() => {
    useTimelineStore.setState({
      sequenceId: "sequence-1",
      tracks: [],
      clips: [clip]
    });
  });
  return render(
    <ThemeProvider theme={mockTheme}>
      <AIEditClipPanel clipId={clip.id} />
    </ThemeProvider>
  );
};

describe("AIEditClipPanel", () => {
  beforeEach(() => {
    mockUseVideoModelsByProvider.mockReturnValue({
      models: [compatibleModel],
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    mockStartEdit.mockReset().mockResolvedValue("request-1");
    mockCancel.mockReset();
    useTimelineStore.setState({ sequenceId: null, tracks: [], clips: [] });
    useDirectGenPendingStore.setState({
      pending: {},
      durationSamples: {},
      editSettlements: {}
    });
  });

  it("exposes Edit video for imported, direct-generated, and workflow-bound clips", () => {
    const clips = [
      makeVideoClip({ sourceType: "imported" }),
      makeVideoClip({ sourceType: "generated", bindingKind: "text-to-video" }),
      makeVideoClip({
        sourceType: "generated",
        bindingKind: "workflow",
        workflowId: "workflow-1"
      })
    ];
    for (const clip of clips) {
      const view = renderPanel(clip);
      expect(screen.getByText("AI Edit")).toBeTruthy();
      expect(screen.getByTestId("ai-edit-submit")).toHaveTextContent("Edit video");
      view.unmount();
    }
  });

  it("explains why audio, missing-asset, and complex-retime clips cannot be edited", () => {
    const clips = [
      makeVideoClip({ mediaType: "audio" }),
      makeVideoClip({ currentAssetId: undefined }),
      makeVideoClip({ timeRemap: { keyframes: [{ t: 0, sourceMs: 0 }] } })
    ];
    for (const clip of clips) {
      const view = renderPanel(clip);
      expect(screen.getByText("Edit video unavailable")).toBeTruthy();
      expect(screen.getByRole("status").textContent).toMatch(/Edit video/);
      view.unmount();
    }
  });

  it("explains when no compatible model is available", () => {
    mockUseVideoModelsByProvider.mockReturnValue({
      models: [],
      isLoading: false,
      error: null,
      refetch: jest.fn()
    });
    renderPanel(makeVideoClip());

    expect(screen.getByText("No compatible model")).toBeTruthy();
    expect(screen.getByText(/video_to_video/)).toBeTruthy();
    expect(screen.getByTestId("ai-edit-submit")).toBeDisabled();
  });

  it("captures the same source eligibility for generated and imported clips", () => {
    const imported = getMediaEditEligibility("sequence-1", makeVideoClip());
    const generated = getMediaEditEligibility(
      "sequence-1",
      makeVideoClip({ sourceType: "generated", bindingKind: "workflow" })
    );

    expect(imported.ok).toBe(true);
    expect(generated.ok).toBe(true);
  });

  it("shows captured terminal settlement details and keeps retry actionable", async () => {
    const clip = makeVideoClip();
    const request = createMediaEditRequest({
      sourceContext: {
        sequenceId: "sequence-1",
        clipId: clip.id,
        sourceAssetId: clip.currentAssetId ?? "",
        sourceStartMs: 0,
        sourceEndMs: clip.durationMs,
        timelineStartMs: clip.startMs,
        timelineDurationMs: clip.durationMs,
        speedMultiplier: 1
      },
      instruction: "remove the crowd",
      provider: "provider-a",
      model: "edit-model"
    });
    useDirectGenPendingStore.setState({
      editSettlements: {
        "request-cancelled": {
          requestId: "request-cancelled",
          sequenceId: "sequence-1",
          clipId: clip.id,
          status: "cancelled",
          settledAt: Date.now(),
          assetIds: [],
          mediaEdit: request
        }
      }
    });

    renderPanel(clip);

    await waitFor(() => {
      expect(screen.getByTestId("ai-edit-instruction")).toHaveValue(
        "remove the crowd"
      );
    });
    expect(
      screen.getByText(/edit was cancelled.*accepted media was left unchanged/i)
    ).toBeTruthy();
    expect(screen.getByTestId("ai-edit-submit")).toHaveTextContent("Retry");
    expect(screen.getByTestId("ai-edit-submit")).not.toBeDisabled();
  });
});
