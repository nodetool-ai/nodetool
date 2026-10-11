/**
 * The one-take dialog confirms the effective render settings, states the
 * image count against its limit, and refuses to start while anything blocks
 * the render.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { OneTakeDirection, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../trpc/client", () => ({
  trpc: {},
  trpcClient: {}
}));

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

const mockStartOneTakeClip = jest.fn(async () => undefined);
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({ startOneTakeClip: mockStartOneTakeClip })
}));

const mockVideoModels = [
  {
    id: "seedance-2",
    provider: "dreamina",
    name: "Seedance",
    supported_tasks: ["reference_to_video"],
    resolutions: ["720p", "1080p"],
    durations: [5, 10, 15]
  }
];
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => ({ models: mockVideoModels })
}));

import OneTakeRenderDialog from "../OneTakeRenderDialog";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useLastModelStore } from "../../../stores/lastModelStore";

const BOARD = "board-one-take-dialog";

/** One shot per duration; the first `stills` shots have a still. */
const seed = (
  durations: number[],
  stills: number,
  direction: OneTakeDirection = { prompt: "One continuous take." }
): void => {
  const store = useStoryboardStore.getState();
  store.removeBoard(BOARD);
  store.ensureBoard(BOARD);
  store.setVideoModel(BOARD, {
    type: "video_model",
    id: "seedance-2",
    provider: "dreamina",
    name: "Seedance"
  });
  durations.forEach((duration, index) => {
    const shot: Shot = {
      type: "shot",
      id: `s${index + 1}`,
      index,
      action: `beat ${index + 1}`,
      duration_seconds: duration,
      status: "planned",
      ...(index < stills && {
        keyframe: { type: "image", asset_id: `still-${index + 1}` }
      })
    };
    store.upsertShot(BOARD, shot);
  });
  store.setOneTake(BOARD, direction);
};

const renderDialog = (onClose = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <OneTakeRenderDialog boardId={BOARD} open onClose={onClose} />
    </ThemeProvider>
  );

const confirmButton = (): HTMLElement =>
  screen.getByRole("button", { name: /render one take/i });

const setting = (label: string): string =>
  screen.getByTestId(`one-take-setting-${label}`).textContent ?? "";

beforeEach(() => {
  mockStartOneTakeClip.mockClear();
  useLastModelStore.setState({ byTask: {}, byKind: {} });
});

describe("OneTakeRenderDialog", () => {
  it("starts the render on the board's model and closes", async () => {
    seed([5, 5], 2);
    const onClose = jest.fn();
    renderDialog(onClose);

    expect(setting("Model")).toBe("Seedance");
    expect(setting("Duration")).toBe("10s");
    expect(setting("Aspect ratio")).toBe("16:9");
    expect(setting("Resolution")).toBe("1080p");
    expect(setting("Images")).toBe("2 of 9");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();

    await userEvent.click(confirmButton());
    expect(mockStartOneTakeClip).toHaveBeenCalledTimes(1);
    expect(mockStartOneTakeClip.mock.calls[0]).toEqual(
      expect.arrayContaining([
        BOARD,
        expect.objectContaining({
          provider: "dreamina",
          model: "seedance-2",
          aspect_ratio: "16:9",
          resolution: "1080p",
          duration: 10
        })
      ])
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("shows and renders the stored settings", async () => {
    seed([5, 5], 2, {
      prompt: "One continuous take.",
      model: { id: "seedance-2", provider: "dreamina", name: "Seedance" },
      duration_seconds: 15,
      aspect_ratio: "1:1",
      resolution: "720p"
    });
    renderDialog();

    expect(setting("Duration")).toBe("15s");
    expect(setting("Aspect ratio")).toBe("1:1");
    expect(setting("Resolution")).toBe("720p");

    await userEvent.click(confirmButton());
    expect(mockStartOneTakeClip.mock.calls[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aspect_ratio: "1:1",
          resolution: "720p",
          duration: 15
        })
      ])
    );
  });

  it("disables confirm without a video model", () => {
    seed([5, 5], 2);
    useStoryboardStore.getState().setVideoModel(BOARD, null);
    renderDialog();
    expect(setting("Model")).toBe("None");
    expect(screen.getByText("No video model chosen.")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("disables confirm when the images are over the limit", () => {
    seed([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10);
    renderDialog();
    expect(setting("Images")).toBe("10 of 9");
    expect(
      screen.getByText("10 images is over the limit of 9. Remove 1.")
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("disables confirm when the model does not offer the take's duration", () => {
    seed([10, 10], 1);
    renderDialog();
    expect(
      screen.getByText(
        "Seedance does not offer a 20s clip. Pick one of 5s, 10s, 15s."
      )
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("disables confirm while the board has no image", () => {
    seed([5], 0);
    renderDialog();
    expect(
      screen.getByText("Render a still for at least one shot.")
    ).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });
});
