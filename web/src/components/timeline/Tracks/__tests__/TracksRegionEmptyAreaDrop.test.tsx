/**
 * TracksRegion empty-area drop — dropping a media asset on empty space
 * auto-creates a track. A VIDEO drop must ALSO create the linked audio track
 * (extracted audio), matching the per-lane drop path; a non-video drop must not
 * trigger extraction.
 *
 * Regression: the empty-area path used to call addImportedClip directly, so
 * dropping a video to create a new track skipped audio extraction.
 */
import React from "react";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import { TracksRegion } from "../TracksRegion";
import { TimelineProvider } from "../../../../stores/timeline/TimelineInstance";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import type { Asset } from "../../../../stores/ApiTypes";

const restFetchMock = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock("../../../../lib/rest-fetch", () => ({
  restFetch: (...args: unknown[]) => restFetchMock(...args)
}));

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "vid-1",
    user_id: "u1",
    parent_id: "root",
    name: "clip.mp4",
    content_type: "video/mp4",
    workflow_id: null,
    created_at: "2024-01-01T00:00:00Z",
    get_url: "https://cdn.example.com/clip.mp4",
    thumb_url: null,
    // A real duration so the client-side duration probe is skipped.
    duration: 5,
    ...overrides
  } as Asset;
}

// Minimal DataTransfer carrying a single-asset drag via the legacy "asset" key
// that deserializeDragData reads.
function dataTransferFor(asset: Asset): DataTransfer {
  const data: Record<string, string> = { asset: JSON.stringify(asset) };
  return {
    types: ["asset"],
    dropEffect: "",
    effectAllowed: "all",
    getData: (k: string) => data[k] ?? "",
    setData: () => {}
  } as unknown as DataTransfer;
}

const renderRegion = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <TimelineProvider>
        <TracksRegion heightPx={400} />
      </TimelineProvider>
    </ThemeProvider>
  );

describe("TracksRegion empty-area drop", () => {
  beforeEach(() => {
    restFetchMock.mockReset();
    restFetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ has_audio: true, asset: { id: "aud-1", duration: 5 } })
    });
    act(() => {
      useTimelineStore.getState().reset();
    });
  });

  it("creates a linked audio track when a VIDEO is dropped on empty space", async () => {
    renderRegion();
    const dropArea = screen.getByTestId("tracks-drop-area");

    await act(async () => {
      fireEvent.drop(dropArea, { dataTransfer: dataTransferFor(makeAsset()) });
    });

    const { tracks, clips } = useTimelineStore.getState();
    expect(tracks.some((t) => t.type === "video")).toBe(true);
    expect(tracks.some((t) => t.type === "audio")).toBe(true);

    const video = clips.find((c) => c.mediaType === "video");
    const audio = clips.find((c) => c.mediaType === "audio");
    expect(video).toBeDefined();
    expect(audio).toBeDefined();
    expect(video?.linkId).toBeTruthy();
    expect(audio?.linkId).toBe(video?.linkId);
    expect(restFetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates only an audio track (no extraction) when AUDIO is dropped", async () => {
    renderRegion();
    const dropArea = screen.getByTestId("tracks-drop-area");

    await act(async () => {
      fireEvent.drop(dropArea, {
        dataTransfer: dataTransferFor(
          makeAsset({
            id: "aud-src",
            name: "song.mp3",
            content_type: "audio/mpeg"
          })
        )
      });
    });

    const { tracks, clips } = useTimelineStore.getState();
    expect(tracks.some((t) => t.type === "audio")).toBe(true);
    // Routed through addImportedClip, not importVideoWithAudio: no extraction
    // request, and the single audio clip is unlinked.
    expect(restFetchMock).not.toHaveBeenCalled();
    const audioClips = clips.filter((c) => c.mediaType === "audio");
    expect(audioClips).toHaveLength(1);
    expect(audioClips[0].linkId).toBeUndefined();
  });
});
