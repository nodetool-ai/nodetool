/**
 * ClipTracking (P0 AI Video, Phase 2): the "Follow object" bind/unbind
 * controls wired to `TimelineStore.bindToTrack`/`unbindTrack`, and the
 * `track_object` starter section reporting itself as not wired up.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipTracking } from "../ClipTracking";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";

beforeEach(() => {
  localStorage.clear();
});

/** Renders and opens the (closed-by-default) collapsible section. */
const renderTracking = (clipId: string) => {
  const view = render(
    <ThemeProvider theme={mockTheme}>
      <ClipTracking
        clip={useTimelineStore.getState().clips.find((c) => c.id === clipId)!}
      />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByRole("button", { expanded: false }));
  return view;
};

function seedTextClip(overrides: Record<string, unknown> = {}): string {
  const clip = makeClip({
    id: "clip_text",
    trackId: "track_1",
    name: "Caption",
    startMs: 0,
    durationMs: 2000,
    mediaType: "text",
    sourceType: "imported",
    ...overrides
  });
  act(() => {
    useTimelineStore.setState({ tracks: [], clips: [clip] });
  });
  return clip.id;
}

function seedVideoClip(): string {
  const clip = makeClip({
    id: "clip_video",
    trackId: "track_1",
    name: "Shot",
    startMs: 0,
    durationMs: 4000,
    mediaType: "video",
    sourceType: "imported",
    currentAssetId: "asset_1"
  });
  act(() => {
    useTimelineStore.setState({ tracks: [], clips: [clip] });
  });
  return clip.id;
}

describe("ClipTracking on a video clip", () => {
  it("shows the tracking starter with a disabled button and no-provider caption", () => {
    seedVideoClip();
    renderTracking("clip_video");

    expect(screen.getByTestId("track-object")).toBeDisabled();
    expect(
      screen.getByText(/no tracking provider is configured/i)
    ).toBeInTheDocument();
  });
});

describe("ClipTracking on a text clip", () => {
  it("offers to follow a track by id", () => {
    seedTextClip();
    renderTracking("clip_text");

    expect(screen.getByLabelText(/track id to follow/i)).toBeInTheDocument();
    expect(screen.getByTestId("bind-to-track")).toBeDisabled();
  });

  it("binds to a track through the store", () => {
    seedTextClip();
    renderTracking("clip_text");

    fireEvent.change(screen.getByLabelText(/track id to follow/i), {
      target: { value: "track_media_1" }
    });
    fireEvent.blur(screen.getByLabelText(/track id to follow/i));
    fireEvent.click(screen.getByTestId("bind-to-track"));

    const clip = useTimelineStore
      .getState()
      .clips.find((c) => c.id === "clip_text")!;
    expect(clip.trackBinding).toEqual({
      trackId: "track_media_1",
      mode: "position"
    });
  });

  it("unbinds through the store", () => {
    seedTextClip({
      trackBinding: { trackId: "track_media_1", mode: "position" }
    });
    renderTracking("clip_text");

    fireEvent.click(screen.getByTestId("unbind-track"));

    const clip = useTimelineStore
      .getState()
      .clips.find((c) => c.id === "clip_text")!;
    expect(clip.trackBinding).toBeUndefined();
  });
});
