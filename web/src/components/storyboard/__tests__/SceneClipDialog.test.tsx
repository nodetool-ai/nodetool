/**
 * The scene clip dialog picks a run of 2 to 5 shots in one scene, prices the
 * render on its confirm button, and on confirm saves the scene clip on the
 * board and starts it on the run's first shot.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SceneClipDirection, Shot } from "@nodetool-ai/protocol";
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
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => ({
    models: [
      {
        id: "seedance-2",
        provider: "dreamina",
        name: "Seedance",
        supported_tasks: ["reference_to_video"]
      }
    ]
  })
}));
jest.mock("../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: () => <div data-testid="video-model-select" />
}));

import SceneClipDialog from "../SceneClipDialog";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useLastModelStore } from "../../../stores/lastModelStore";

const BOARD = "board-scene-clip-dialog";

const shots: Shot[] = [0, 1, 2, 3, 4, 5].map((index) => ({
  type: "shot",
  id: `s${index + 1}`,
  index,
  action: `beat ${index + 1}`,
  duration_seconds: 2,
  status: "planned",
  keyframe: {
    type: "image",
    uri: `/storage/still-${index + 1}.png`,
    asset_id: `still-${index + 1}`
  }
}));

const draft: SceneClipDirection = {
  id: "clip-new",
  prompt: "",
  shot_ids: ["s1", "s2", "s3", "s4", "s5"]
};

const seed = (): void => {
  const store = useStoryboardStore.getState();
  store.removeBoard(BOARD);
  store.ensureBoard(BOARD);
  store.setVideoModel(BOARD, {
    type: "video_model",
    id: "seedance-2",
    provider: "dreamina",
    name: "Seedance"
  });
  shots.forEach((shot) => store.upsertShot(BOARD, shot));
};

const renderDialog = (onClose = jest.fn()) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeProvider theme={mockTheme}>
        <SceneClipDialog
          boardId={BOARD}
          sceneShots={shots}
          clip={draft}
          saved={false}
          onClose={onClose}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );

const pick = async (field: string, option: string): Promise<void> => {
  await userEvent.click(screen.getByRole("combobox", { name: field }));
  await userEvent.click(
    within(screen.getByRole("listbox")).getByRole("option", { name: option })
  );
};

beforeEach(() => {
  mockStartOneTakeClip.mockClear();
  useLastModelStore.setState({ byTask: {}, byKind: {} });
  seed();
});

describe("SceneClipDialog", () => {
  it("offers at most five shots and narrows the run", async () => {
    renderDialog();
    expect(screen.getByTestId("scene-clip-summary")).toHaveTextContent(
      "10s · 16:9 · 1080p · 5 of 9 images"
    );
    await pick("From", "Shot 4");
    // Three shots remain from shot 4, so the run shrinks to fit.
    expect(screen.getByRole("combobox", { name: "Length" })).toHaveTextContent(
      "3 shots"
    );
    await pick("Length", "2 shots");
    expect(screen.getByTestId("scene-clip-summary")).toHaveTextContent(
      "4s · 16:9 · 1080p · 2 of 9 images"
    );
  });

  it("saves the scene clip and starts it on the run's first shot", async () => {
    const onClose = jest.fn();
    renderDialog(onClose);
    await pick("From", "Shot 2");
    await pick("Length", "2 shots");
    await userEvent.click(
      screen.getByRole("button", { name: /render scene clip/i })
    );

    expect(useStoryboardStore.getState().getBoard(BOARD)?.sceneClips).toEqual([
      { ...draft, shot_ids: ["s2", "s3"] }
    ]);
    expect(mockStartOneTakeClip).toHaveBeenCalledTimes(1);
    const [boardId, firstShot, data, completion] = mockStartOneTakeClip.mock
      .calls[0] as unknown as [
      string,
      Shot,
      Record<string, unknown>,
      { steps: unknown[] }
    ];
    expect(boardId).toBe(BOARD);
    expect(firstShot.id).toBe("s2");
    expect(data).toMatchObject({ duration: 4, model: "seedance-2" });
    expect(completion.steps).toHaveLength(2);
    expect(onClose).toHaveBeenCalled();
  });
});
