import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import {
  makeClip,
  makeTrack,
  type MediaTrack,
  type TimelineSequence
} from "@nodetool-ai/timeline";

import mockTheme from "../../../__mocks__/themeMock";
import { AdaptFormatDialog } from "../AdaptFormatDialog";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";

const createAdaptations = jest.fn(async () => ({
  createdIds: ["derived-1"],
  createdAspectRatios: ["9:16"],
  failures: [] as Array<{ aspectRatio: string; message: string }>
}));

jest.mock("../../../hooks/timeline/useCreateFormatAdaptation", () => ({
  useCreateFormatAdaptation: () => ({
    createAdaptations,
    isCreating: false,
    error: null
  })
}));

const sequence: TimelineSequence = {
  id: "sequence-1",
  projectId: "project-1",
  name: "Campaign",
  fps: 30,
  width: 1920,
  height: 1080,
  durationMs: 3000,
  tracks: [makeTrack({ id: "track-1", name: "Video", index: 0 })],
  clips: [
    makeClip({
      id: "clip-1",
      trackId: "track-1",
      name: "Shot",
      mediaType: "video",
      sourceType: "imported",
      currentAssetId: "asset-1",
      startMs: 0,
      durationMs: 3000
    })
  ],
  markers: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};

const subject: MediaTrack = {
  id: "subject-1",
  clipId: "clip-1",
  sourceAssetId: "asset-1",
  name: "Speaker",
  kind: "box",
  sourceStartMs: 0,
  sourceEndMs: 3000,
  samples: [{ sourceMs: 0, x: 0.5, y: 0.5, width: 0.2, height: 0.5 }],
  status: "ready"
};

const renderDialog = (
  mediaTracks: readonly MediaTrack[] = [],
  openedSequence: TimelineSequence = sequence
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AdaptFormatDialog
        open
        onClose={jest.fn()}
        sequence={openedSequence}
        mediaTracks={mediaTracks}
      />
    </ThemeProvider>
  );

describe("AdaptFormatDialog", () => {
  beforeEach(() => {
    createAdaptations.mockClear();
    act(() => {
      useTimelineStore.getState().reset();
      useTimelineStore.getState().addClips(sequence.clips);
    });
  });

  it("reads clips from the live document, not the sequence loaded at open", () => {
    renderDialog([subject], { ...sequence, clips: [] });

    expect(screen.getByRole("radio", { name: "Smart reframe" })).toBeEnabled();
    expect(
      screen.getByRole("radio", { name: "Follow selected object" })
    ).toBeEnabled();
  });

  it("defaults to a nondestructive 9:16 Smart reframe adaptation", async () => {
    renderDialog([subject]);

    expect(screen.getByText("1920 × 1080")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /9:16/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Smart reframe" })).toBeChecked();

    await userEvent.click(
      screen.getByRole("button", { name: "Create adaptation" })
    );

    expect(createAdaptations).toHaveBeenCalledWith({
      aspectRatios: ["9:16"],
      strategy: "smart",
      safeMargin: 0.1
    });
  });

  it("makes Smart reframe unavailable without analysis or authored framing", () => {
    renderDialog();

    expect(screen.getByRole("radio", { name: "Center" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Smart reframe" })).toBeDisabled();
    expect(
      screen.getByText(/needs a current subject track or authored framing/i)
    ).toBeInTheDocument();
  });

  it("supports batch formats and selecting a tracked subject", async () => {
    renderDialog([subject]);
    await userEvent.click(screen.getByRole("checkbox", { name: /1:1/i }));
    await userEvent.click(
      screen.getByRole("radio", { name: "Follow selected object" })
    );
    await userEvent.click(
      screen.getByRole("combobox", { name: "Reframe subject" })
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Speaker" })
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create adaptations" })
    );

    expect(createAdaptations).toHaveBeenCalledWith({
      aspectRatios: ["9:16", "1:1"],
      strategy: "track",
      safeMargin: 0.1,
      trackId: "subject-1"
    });
  });
});
