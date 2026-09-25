/**
 * Rendering one shot from its hover menu with a picked model: the dialog opens
 * on the model the shot already remembers, a different pick is the one the
 * render uses, and a clip that has no still to animate cannot start.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useResolvedMediaUri");
jest.mock("../../../hooks/assets/useAssetsForLocators");

jest.mock("../../assets/AssetViewer", () => ({
  __esModule: true,
  default: () => <div data-testid="asset-viewer" />
}));

jest.mock("../../../trpc/client", () => ({
  trpc: { scripts: { get: { useQuery: () => ({ data: undefined }) } } },
  trpcClient: {}
}));

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

jest.mock("../../../serverState/useAssetUpload", () => ({
  useAssetUpload: (selector: (state: unknown) => unknown) =>
    selector({ uploadAsset: jest.fn() })
}));

const mockGenerateKeyframe = jest.fn(async () => undefined);
const mockGenerateClip = jest.fn(async () => undefined);
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: mockGenerateKeyframe,
    generateClip: mockGenerateClip,
    generateRevisedClip: jest.fn(async () => undefined),
    retryFailedRequest: jest.fn(async () => undefined)
  })
}));

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({
    models: [
      { id: "flux", provider: "fal", name: "Flux" },
      { id: "imagen", provider: "gemini", name: "Imagen" }
    ]
  }),
  useVideoModelsByProvider: () => ({
    models: [
      {
        id: "kling",
        provider: "fal",
        name: "Kling",
        supported_tasks: ["image_to_video"]
      },
      {
        id: "veo",
        provider: "gemini",
        name: "Veo",
        supported_tasks: ["image_to_video", "text_to_video"]
      }
    ]
  })
}));

// The real pickers load catalogs over tRPC; a button per model stands in.
jest.mock("../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: ({
    value,
    onChange
  }: {
    value: string;
    onChange: (model: unknown) => void;
  }) => (
    <div data-testid="image-model-select" data-value={value}>
      <button
        type="button"
        onClick={() =>
          onChange({
            type: "image_model",
            id: "imagen",
            provider: "gemini",
            name: "Imagen"
          })
        }
      >
        Pick Imagen
      </button>
    </div>
  )
}));

jest.mock("../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: ({ value, task }: { value: string; task: string }) => (
    <div data-testid="video-model-select" data-value={value} data-task={task} />
  )
}));

import ShotCard from "../ShotCard";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-render-dialog";

const seedShot = (overrides: Partial<Shot> = {}): Shot => {
  const shot: Shot = {
    type: "shot",
    id: "shot-1",
    index: 0,
    slug: "Opening",
    action: "A lighthouse at dusk",
    status: "planned",
    ...overrides
  };
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, shot);
  return shot;
};

const renderCard = (shot: Shot) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotCard boardId={BOARD} shot={shot} />
    </ThemeProvider>
  );

const openMenuItem = async (name: string): Promise<void> => {
  await userEvent.click(screen.getByRole("button", { name: "Shot actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
};

beforeEach(() => {
  mockGenerateKeyframe.mockClear();
  mockGenerateClip.mockClear();
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("ShotCard render dialog", () => {
  it("renders a still with the model picked in the dialog", async () => {
    const shot = seedShot({
      still_model: { id: "flux", provider: "fal", name: "Flux" }
    });
    renderCard(shot);

    await openMenuItem("Render still…");
    expect(screen.getByTestId("image-model-select")).toHaveAttribute(
      "data-value",
      "flux"
    );

    await userEvent.click(screen.getByRole("button", { name: "Pick Imagen" }));
    expect(screen.getByTestId("image-model-select")).toHaveAttribute(
      "data-value",
      "imagen"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^Render still/ })
    );

    expect(mockGenerateKeyframe).toHaveBeenCalledWith(
      BOARD,
      shot,
      expect.objectContaining({ id: "imagen", provider: "gemini" })
    );
    expect(mockGenerateClip).not.toHaveBeenCalled();
  });

  it("renders a clip with the shot's remembered clip model", async () => {
    const shot = seedShot({
      status: "keyframe_ready",
      keyframe: { type: "image", uri: "asset://img-1", asset_id: "img-1" },
      clip_model: { id: "kling", provider: "fal", name: "Kling" }
    });
    renderCard(shot);

    await openMenuItem("Render clip…");
    const picker = screen.getByTestId("video-model-select");
    expect(picker).toHaveAttribute("data-value", "kling");
    expect(picker).toHaveAttribute("data-task", "image_to_video");

    await userEvent.click(screen.getByRole("button", { name: /^Render clip/ }));

    expect(mockGenerateClip).toHaveBeenCalledWith(
      BOARD,
      shot,
      expect.objectContaining({ id: "kling", provider: "fal" })
    );
  });

  it("offers only a model that fits a direct shot's task", async () => {
    const shot = seedShot({
      render_mode: "direct",
      clip_model: { id: "kling", provider: "fal", name: "Kling" }
    });
    useStoryboardStore.getState().setVideoModel(BOARD, {
      type: "video_model",
      id: "veo",
      provider: "gemini",
      name: "Veo"
    });
    renderCard(shot);

    await openMenuItem("Render clip…");
    const picker = screen.getByTestId("video-model-select");
    // Kling cannot render from a prompt alone, so the board's Veo is offered.
    expect(picker).toHaveAttribute("data-task", "text_to_video");
    expect(picker).toHaveAttribute("data-value", "veo");
  });

  it("cannot start a clip for a shot with no still to animate", async () => {
    const shot = seedShot({
      clip_model: { id: "kling", provider: "fal", name: "Kling" }
    });
    renderCard(shot);

    await openMenuItem("Render clip…");

    expect(screen.getByRole("alert")).toHaveTextContent("Render a still first");
    expect(screen.getByRole("button", { name: /^Render clip/ })).toBeDisabled();
  });

  it("disables both renders while the shot is rendering", async () => {
    const shot = seedShot({ status: "clip_generating" });
    renderCard(shot);

    await userEvent.click(screen.getByRole("button", { name: "Shot actions" }));

    expect(
      screen.getByRole("menuitem", { name: "Render still…" })
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitem", { name: "Render clip…" })
    ).toHaveAttribute("aria-disabled", "true");
  });
});
