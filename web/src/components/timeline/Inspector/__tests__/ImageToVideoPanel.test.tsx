import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../../stores/timeline/TimelineUIStore";
import ImageToVideoPanel from "../ImageToVideoPanel";

const mockStart = jest.fn<(clipId: string) => Promise<string | null>>();
const mockMediaOptions = jest.fn();
const mockNaturalSize = jest.fn();
jest.mock("../../../../lib/env", () => ({
  isLocalhost: true,
  isElectron: false
}));
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => ({
    models: [
      {
        id: "i2v-model",
        name: "Image to video model",
        provider: "fal_ai",
        supported_tasks: ["image_to_video"],
        durations: [4, 8],
        aspect_ratios: ["16:9", "9:16"],
        resolutions: ["480p", "720p"]
      }
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn()
  }),
  useMediaOptions: () => mockMediaOptions()
}));
jest.mock("../../../../hooks/timeline/useTimelineDirectGenJob", () => ({
  useTimelineDirectGenJob: () => ({ start: mockStart })
}));
jest.mock("../../../../hooks/useResolvedMediaUri", () => ({
  useResolvedMediaUri: () => undefined
}));
jest.mock("../../../../hooks/useImageNaturalSize", () => ({
  useImageNaturalSize: () => mockNaturalSize()
}));
jest.mock("../../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: () => <div>Video model picker</div>
}));

const pictures = makeTrack({ id: "pictures", name: "Pictures", type: "video" });
const image = makeClip({
  id: "image",
  name: "Portrait",
  trackId: "pictures",
  mediaType: "image",
  sourceType: "imported",
  currentAssetId: "image-asset",
  startMs: 2000,
  durationMs: 4000,
  width: 1080,
  height: 1920
});

function show(): void {
  render(
    <ThemeProvider theme={mockTheme}>
      <ImageToVideoPanel clipId="image" />
    </ThemeProvider>
  );
}

describe("Image to Video inspector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue("request");
    mockNaturalSize.mockReturnValue({ failed: false });
    mockMediaOptions.mockReturnValue({
      data: {
        durations: [4, 8],
        aspectRatios: ["16:9", "9:16"],
        resolutions: ["480p", "720p"]
      }
    });
    useTimelineStore.setState({
      sequenceId: "sequence",
      tracks: [{ ...pictures, index: 0 }],
      clips: [image]
    });
  });

  it("shows the duration and size the video will be generated at", () => {
    show();
    expect(screen.getByTestId("image-to-video-summary")).toHaveTextContent(
      "4 s · 9:16 · 720p"
    );
  });

  it("creates the video above the image over the same span and starts it", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Motion prompt"), {
      target: { value: "Slow push in" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));

    const { tracks, clips } = useTimelineStore.getState();
    const video = clips.find((clip) => clip.bindingKind === "image-to-video");
    expect(video).toMatchObject({
      mediaType: "video",
      sourceClipId: "image",
      startMs: 2000,
      durationMs: 4000,
      prompt: "Slow push in",
      provider: "fal_ai",
      model: "i2v-model",
      aspectRatio: "9:16",
      resolution: "720p"
    });
    expect(mockStart).toHaveBeenCalledWith(video?.id);
    const videoTrack = tracks.find((track) => track.id === video?.trackId);
    const imageTrack = tracks.find((track) => track.id === "pictures");
    expect(videoTrack?.type).toBe("video");
    expect(videoTrack!.index).toBeLessThan(imageTrack!.index);
  });

  it("lengthens the video clip when the model cannot render the image's duration", () => {
    mockMediaOptions.mockReturnValue({ data: { durations: [5, 10] } });
    show();
    expect(
      screen.getByText(
        "This model cannot render 4 s, so the video clip is 5 s long."
      )
    ).toBeInTheDocument();
  });

  it("waits for the image size before it can generate", () => {
    useTimelineStore.setState({
      clips: [{ ...image, width: undefined, height: undefined }]
    });
    show();
    fireEvent.change(screen.getByLabelText("Motion prompt"), {
      target: { value: "Slow push in" }
    });
    expect(
      screen.getByRole("button", { name: "Generate video" })
    ).toBeDisabled();
    expect(
      screen.queryByText(
        "The image could not be loaded, so its size is unknown."
      )
    ).not.toBeInTheDocument();
  });

  it("says why it cannot generate when the image failed to load", () => {
    mockNaturalSize.mockReturnValue({ failed: true });
    useTimelineStore.setState({
      clips: [{ ...image, width: undefined, height: undefined }]
    });
    show();
    expect(
      screen.getByText("The image could not be loaded, so its size is unknown.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate video" })
    ).toBeDisabled();
  });

  it("uses the catalog's options when the model lists none", () => {
    mockMediaOptions.mockReturnValue({
      data: { durations: [], aspectRatios: [], resolutions: [] }
    });
    show();
    expect(screen.getByTestId("image-to-video-summary")).toHaveTextContent(
      "4 s · 9:16 · 720p"
    );
  });

  it("keeps the panel and shows the error when the start fails", async () => {
    useTimelineUIStore.setState({ selectedClipIds: new Set(["image"]) });
    mockStart.mockRejectedValue(new Error("Provider refused the request."));
    show();
    fireEvent.change(screen.getByLabelText("Motion prompt"), {
      target: { value: "Slow push in" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    expect(
      await screen.findByText("Provider refused the request.")
    ).toBeInTheDocument();
    expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual([
      "image"
    ]);
  });

  it("selects the video clip once it has started", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Motion prompt"), {
      target: { value: "Slow push in" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate video" }));
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(1));
    const video = useTimelineStore
      .getState()
      .clips.find((clip) => clip.bindingKind === "image-to-video");
    await waitFor(() =>
      expect([...useTimelineUIStore.getState().selectedClipIds]).toEqual([
        video?.id
      ])
    );
  });

  it("asks for the image first when the clip has none", () => {
    useTimelineStore.setState({
      clips: [{ ...image, currentAssetId: undefined }]
    });
    show();
    expect(screen.getByText("No image yet")).toBeInTheDocument();
  });
});
