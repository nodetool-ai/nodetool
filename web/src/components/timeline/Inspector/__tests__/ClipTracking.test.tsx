/**
 * ClipTracking (P0 AI Video, Phase 2): the "Follow object" bind/unbind
 * controls wired to `TimelineStore.bindToTrack`/`unbindTrack`, and the
 * executable `track_object` inspector action.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jest } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip } from "@nodetool-ai/timeline";

import mockTheme from "../../../../__mocks__/themeMock";
import { ClipTracking } from "../ClipTracking";
import {
  getTimelineTemporal,
  useTimelineStore
} from "../../../../stores/timeline/TimelineStore";

const mockTrackObject = jest.fn();
const mockSelection = {
  clipId: "clip_video",
  sourceAssetId: "asset_1",
  sourceMs: 0,
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
};

jest.mock("../../../../hooks/timeline/useTrackObject", () => ({
  useTrackObject: (...args: unknown[]) => mockTrackObject(...args)
}));
jest.mock("../../preview/useTrackingSelection", () => ({
  useTrackingSelection: () => ({
    selection: mockSelection,
    select: jest.fn()
  })
}));

beforeEach(() => {
  localStorage.clear();
  mockTrackObject.mockReset();
  mockTrackObject.mockReturnValue({
    model: undefined,
    modelError: null,
    isLoadingModel: false,
    status: "idle",
    error: null,
    canTrack: false,
    start: jest.fn()
  });
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
  it("refuses submission without an executable tracking model", () => {
    seedVideoClip();
    renderTracking("clip_video");

    expect(screen.getByTestId("track-object")).toBeDisabled();
    expect(
      screen.getByText(/no subject-tracking provider or model is available/i)
    ).toBeInTheDocument();
  });

  it("submits the selected normalized region when a model is available", async () => {
    const start = jest.fn(
      async (): Promise<{ status: "ready" }> => ({ status: "ready" })
    );
    mockTrackObject.mockReturnValue({
      model: { id: "tracker-1", name: "Tracker", provider: "provider-1" },
      modelError: null,
      isLoadingModel: false,
      status: "idle",
      error: null,
      canTrack: true,
      start
    });
    seedVideoClip();
    renderTracking("clip_video");

    const button = screen.getByTestId("track-object");
    expect(button).toBeEnabled();
    await userEvent.click(button);

    expect(start).toHaveBeenCalledTimes(1);
    expect(mockTrackObject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "clip_video" }),
      mockSelection
    );
  });

  it("surfaces a provider failure and keeps submission disabled", () => {
    mockTrackObject.mockReturnValue({
      model: { id: "tracker-1", name: "Tracker", provider: "provider-1" },
      modelError: null,
      isLoadingModel: false,
      status: "failed",
      error: "The tracking provider rejected the source window.",
      canTrack: false,
      start: jest.fn()
    });
    seedVideoClip();
    renderTracking("clip_video");

    expect(screen.getByTestId("track-object")).toBeDisabled();
    expect(
      screen.getByText("The tracking provider rejected the source window.")
    ).toHaveAttribute("role", "alert");
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

  it("commits track and mode edits for an existing binding with undo history", async () => {
    const user = userEvent.setup();
    seedTextClip({
      trackBinding: { trackId: "track_media_1", mode: "position" }
    });
    getTimelineTemporal().clear();
    renderTracking("clip_text");

    const trackId = screen.getByRole("textbox", {
      name: /track id to follow/i
    });
    await user.clear(trackId);
    await user.type(trackId, "track_media_2");
    await user.tab();
    await user.click(screen.getByRole("combobox", { name: /follow mode/i }));
    await user.click(
      screen.getByRole("option", { name: /position \+ scale/i })
    );

    expect(
      useTimelineStore.getState().clips.find((clip) => clip.id === "clip_text")
        ?.trackBinding
    ).toMatchObject({
      trackId: "track_media_2",
      mode: "position_scale"
    });
    expect(getTimelineTemporal().pastStates).toHaveLength(2);
  });
});
