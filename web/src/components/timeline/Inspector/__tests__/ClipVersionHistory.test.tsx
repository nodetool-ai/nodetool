/**
 * ClipVersionHistory's take affordances (P0 AI Video, PRD § 8.10): the label
 * shown per tile, and the rename/delete controls wired to the store's
 * renameTake/deleteTake actions.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipVersionHistory } from "../ClipVersionHistory";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

jest.mock("../../../../stores/AssetStore", () => ({
  useAssetStore: (selector: (state: { get: () => Promise<never> }) => unknown) =>
    selector({ get: () => Promise.reject(new Error("no asset in test")) })
}));

const renderHistory = (clipId: string) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ClipVersionHistory clipId={clipId} />
    </ThemeProvider>
  );

function seedClipWithTwoTakes(): string {
  const clip = makeClip({
    id: "clip_1",
    trackId: "track_1",
    name: "Shot",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "generated",
    status: "generated",
    currentAssetId: "asset_2",
    activeTakeId: "take_2",
    versions: [
      {
        id: "take_1",
        createdAt: "2026-01-01T00:00:00.000Z",
        jobId: "job_1",
        assetId: "asset_1",
        workflowUpdatedAt: "2026-01-01T00:00:00.000Z",
        dependencyHash: "hash_1",
        paramOverridesSnapshot: {},
        status: "success"
      },
      {
        id: "take_2",
        createdAt: "2026-01-02T00:00:00.000Z",
        jobId: "job_2",
        assetId: "asset_2",
        workflowUpdatedAt: "2026-01-02T00:00:00.000Z",
        dependencyHash: "hash_2",
        paramOverridesSnapshot: {},
        status: "success",
        label: "Hero take"
      }
    ]
  });
  act(() => {
    useTimelineStore.setState({ tracks: [], clips: [clip] });
  });
  return clip.id;
}

describe("ClipVersionHistory", () => {
  it("shows a take's label when set, and falls back to the ordinal otherwise", () => {
    const clipId = seedClipWithTwoTakes();
    renderHistory(clipId);

    expect(screen.getByLabelText(/Rename Hero take/)).toBeInTheDocument();
    // The older, unlabeled take falls back to its recency ordinal.
    expect(screen.getByLabelText(/Rename #1/)).toBeInTheDocument();
  });

  it("disables delete, with a tooltip, on the active take", () => {
    const clipId = seedClipWithTwoTakes();
    renderHistory(clipId);

    const deleteActive = screen.getByLabelText(
      /select a different take before deleting it/i
    );
    expect(deleteActive).toBeDisabled();
  });

  it("deletes a non-active take through the store", () => {
    const clipId = seedClipWithTwoTakes();
    renderHistory(clipId);

    // The rename/delete affordances reveal on hover/focus (CSS); jsdom does
    // not simulate real hover, so the click is dispatched directly here —
    // the same handler a mouse click after hovering would invoke.
    const deleteNonActive = screen.getByLabelText(/Delete #1/);
    expect(deleteNonActive).not.toBeDisabled();
    fireEvent.click(deleteNonActive);

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId)!;
    expect(clip.versions.map((v) => v.id)).toEqual(["take_2"]);
  });

  it("renames a take through the store", async () => {
    const user = userEvent.setup();
    const clipId = seedClipWithTwoTakes();
    renderHistory(clipId);

    fireEvent.click(screen.getByLabelText(/Rename #1/));
    const input = screen.getByLabelText(/Take label/i);
    await user.clear(input);
    await user.type(input, "Wide{Enter}");

    const clip = useTimelineStore.getState().clips.find((c) => c.id === clipId)!;
    expect(clip.versions.find((v) => v.id === "take_1")?.label).toBe("Wide");
  });
});
