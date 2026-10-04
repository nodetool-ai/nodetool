import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import ImageToVideoPanel from "../ImageToVideoPanel";

const mockStart = jest.fn<(clipId: string) => Promise<string | null>>();
const mockMediaOptions = jest.fn();
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
        supported_tasks: ["image_to_video"]
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

  it("asks for the image first when the clip has none", () => {
    useTimelineStore.setState({
      clips: [{ ...image, currentAssetId: undefined }]
    });
    show();
    expect(screen.getByText("No image yet")).toBeInTheDocument();
  });
});
