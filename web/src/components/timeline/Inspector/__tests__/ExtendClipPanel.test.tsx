import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ThemeProvider } from "@mui/material/styles";
import {
  makeClip,
  createExtensionRequest,
  landExtensionCandidate
} from "@nodetool-ai/timeline";
import mockTheme from "../../../../__mocks__/themeMock";
import { useTimelineStore } from "../../../../stores/timeline/TimelineStore";
import ExtendClipPanel from "../ExtendClipPanel";
import { useExtensionJobsStore } from "../../../../hooks/timeline/useTimelineExtension";

const mockStart = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockApply = jest.fn();
const mockRecover = jest.fn();
const mockModels = jest.fn();
jest.mock("../../../../lib/env", () => ({
  isLocalhost: true,
  isElectron: false
}));
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => mockModels()
}));
jest.mock("../../../../hooks/timeline/useTimelineExtension", () => {
  const original = jest.requireActual<
    typeof import("../../../../hooks/timeline/useTimelineExtension")
  >("../../../../hooks/timeline/useTimelineExtension");
  return {
    ...original,
    useTimelineExtension: () => ({
      start: mockStart,
      apply: mockApply,
      recover: mockRecover
    })
  };
});

const model = {
  id: "extend-model",
  name: "Extension model",
  provider: "fal_ai",
  supported_tasks: ["extend_video"]
};
const clip = makeClip({
  id: "video",
  name: "Video",
  trackId: "track",
  mediaType: "video",
  sourceType: "imported",
  currentAssetId: "source",
  startMs: 5000,
  durationMs: 4000
});

function show(): void {
  render(
    <ThemeProvider theme={mockTheme}>
      <ExtendClipPanel clipId="video" />
    </ThemeProvider>
  );
}

describe("Extend inspector", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStart.mockResolvedValue(undefined);
    mockModels.mockReturnValue({
      models: [model],
      isLoading: false,
      error: null
    });
    useTimelineStore.setState({ sequenceId: "sequence", clips: [clip] });
    useExtensionJobsStore.setState({ jobs: {} });
  });

  it("submits end, added source duration, intent, and an extension model", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Extension intent"), {
      target: { value: "Continue the camera pan" }
    });
    fireEvent.change(screen.getByLabelText("Added source seconds"), {
      target: { value: "4" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate extension" }));
    await waitFor(() =>
      expect(mockStart).toHaveBeenCalledWith(
        expect.objectContaining({
          clipId: "video",
          direction: "end",
          addedSourceDurationMs: 4000,
          prompt: "Continue the camera pan",
          model: expect.objectContaining({ supportedTasks: ["extend_video"] })
        })
      )
    );
  });

  it("does not offer ordinary editors as extension models", () => {
    mockModels.mockReturnValue({
      models: [{ ...model, supported_tasks: ["video_to_video"] }],
      isLoading: false
    });
    show();
    expect(
      screen.getByText("No extension model available")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Generate extension" })
    ).not.toBeInTheDocument();
  });

  it("offers only end extension for an end-only model", () => {
    mockModels.mockReturnValue({
      models: [
        {
          ...model,
          supported_tasks: ["extend_video", "extend_video_end"]
        }
      ],
      isLoading: false
    });
    show();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Extend from" }));
    expect(screen.getByRole("option", { name: "End" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Start" })).toBeNull();
  });

  it("offers every explicit timing choice for an inactive candidate", () => {
    const request = createExtensionRequest({
      clip,
      sequenceId: "sequence",
      requestId: "request",
      model: { ...model, supportedTasks: model.supported_tasks },
      direction: "start",
      addedSourceDurationMs: 2000,
      prompt: "Extend"
    });
    const candidate = landExtensionCandidate(clip, request, {
      assetId: "candidate",
      durationMs: 6000,
      createdAt: "2026-01-01"
    });
    act(() => {
      useTimelineStore.setState({ clips: [candidate] });
      useExtensionJobsStore.getState().put({ request, status: "ready" });
    });
    show();
    for (const [name, timing] of [
      ["Keep cut and retain handles", "keep-cut"],
      ["Extend into available space", "available-space"],
      ["Extend and ripple later clips", "ripple"]
    ]) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(mockApply).toHaveBeenLastCalledWith(request, timing);
    }
    expect(useTimelineStore.getState().clips[0].currentAssetId).toBe("source");
  });

  it("keeps a failed request recoverable", () => {
    const request = createExtensionRequest({
      clip,
      sequenceId: "sequence",
      requestId: "request",
      model: { ...model, supportedTasks: model.supported_tasks },
      direction: "end",
      addedSourceDurationMs: 2000,
      prompt: "Extend"
    });
    useExtensionJobsStore
      .getState()
      .put({ request, status: "error", error: "Connection lost" });
    show();
    fireEvent.click(screen.getByRole("button", { name: "Recover extension" }));
    expect(mockRecover).toHaveBeenCalledWith(request);
  });
});
