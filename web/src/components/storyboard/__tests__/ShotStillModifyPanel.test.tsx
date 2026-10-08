import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

// Media sources resolve through TanStack Query; these suites render no
// QueryClientProvider, so use the manual mock.
jest.mock("../../../hooks/useResolvedMediaUri");

const generateStillVariant = jest.fn();
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({ generateStillVariant })
}));

const mockModels: Array<{
  id: string;
  provider: string;
  supported_tasks?: string[];
}> = [];
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: mockModels })
}));

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

// The model picker reads provider catalogs; stand in a button per picker that
// selects one model, and show which tasks it was asked to filter by.
jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: ({
    task,
    onChange
  }: {
    task: string | string[];
    onChange: (value: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          type: "image_model",
          id: "pick",
          provider: "fal_ai",
          name: "Pick"
        })
      }
    >
      {`Pick ${[task].flat().join("+")} model`}
    </button>
  )
}));

// A reframe measures the still in the browser; jsdom decodes no images.
jest.mock("../shotImageEdits", () => ({
  ...jest.requireActual("../shotImageEdits"),
  stillSize: jest.fn().mockResolvedValue({ width: 1600, height: 900 })
}));

import ShotStillModifyPanel from "../ShotStillModifyPanel";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-modify";

const stillShot: Shot = {
  type: "shot",
  id: "shot-modify",
  index: 0,
  action: "a lighthouse at dusk",
  status: "keyframe_ready",
  keyframe: { type: "image", asset_id: "still-1", uri: "asset://still-1.png" }
};

const renderPanel = (shot: Shot = stillShot) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotStillModifyPanel boardId={BOARD} shot={shot} />
    </ThemeProvider>
  );

beforeEach(() => {
  generateStillVariant.mockReset();
  generateStillVariant.mockResolvedValue(undefined);
  mockModels.length = 0;
  useStoryboardStore.getState().ensureBoard(BOARD);
  useStoryboardStore.getState().upsertShot(BOARD, stillShot);
});

describe("ShotStillModifyPanel", () => {
  it("asks for a still before offering changes", () => {
    renderPanel({ ...stillShot, keyframe: undefined });
    expect(
      screen.getByText(/Render or upload a still first/)
    ).toBeInTheDocument();
  });

  it("sends a prompt edit of the current still", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Pick image_to_image+inpainting model" })
    );
    const generate = screen.getByRole("button", { name: /Generate edit/ });
    expect(generate).toBeDisabled();
    await user.type(screen.getByLabelText("What to change"), "Make the sky violet");
    await user.click(generate);

    expect(generateStillVariant).toHaveBeenCalledWith(BOARD, stillShot, {
      mode: "image_edit",
      model: { id: "pick", provider: "fal_ai", name: "Pick" },
      sourceAssetId: "still-1",
      prompt: "Make the sky violet",
      maskAssetId: undefined
    });
  });

  it("refuses an edit model the catalog says cannot edit", async () => {
    mockModels.push({
      id: "pick",
      provider: "fal_ai",
      supported_tasks: ["text_to_image"]
    });
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Pick image_to_image+inpainting model" })
    );
    await user.type(screen.getByLabelText("What to change"), "Brighter");

    expect(
      screen.getByText(/This model cannot edit an existing image/)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate edit/ })).toBeDisabled();
  });

  it("upscales at the chosen factor", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("tab", { name: "Upscale" }));
    await user.click(screen.getByRole("button", { name: "Pick upscale model" }));
    await user.click(screen.getByRole("button", { name: "4×" }));
    await user.click(screen.getByRole("button", { name: /^Upscale/ }));

    expect(generateStillVariant).toHaveBeenCalledWith(
      BOARD,
      stillShot,
      expect.objectContaining({ mode: "upscale", scale: 4, sourceAssetId: "still-1" })
    );
  });

  it("reframes to another ratio by growing the frame around the still", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("tab", { name: "Reframe" }));
    await user.click(screen.getByRole("button", { name: "Pick outpaint model" }));
    // A 16:9 board offers the first other ratio, 9:16, by default.
    await user.click(screen.getByRole("button", { name: /Reframe to 9:16/ }));

    await waitFor(() =>
      expect(generateStillVariant).toHaveBeenCalledWith(
        BOARD,
        stillShot,
        expect.objectContaining({
          mode: "outpaint",
          aspectRatio: "9:16",
          padding: { left: 0, right: 0, top: 972, bottom: 972 }
        })
      )
    );
  });
});
