import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { OneTakeDirection, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useResolvedMediaUri");

jest.mock("../../../trpc/client", () => ({
  trpc: {},
  trpcClient: {}
}));

jest.mock(
  "../OneTakeRenderDialog",
  () => ({
    __esModule: true,
    default: ({ open, boardId }: { open: boolean; boardId: string }) =>
      open ? <div data-testid="one-take-render-dialog">{boardId}</div> : null
  }),
  { virtual: true }
);

const mockVideoModels: unknown[] = [];
jest.mock("../../../hooks/useModelsByProvider", () => ({
  useVideoModelsByProvider: () => ({ models: mockVideoModels })
}));

jest.mock("../../properties/VideoModelSelect", () => ({
  __esModule: true,
  default: ({
    value,
    task,
    onChange
  }: {
    value: string;
    task: string;
    onChange: (value: unknown) => void;
  }) => (
    <button
      type="button"
      data-testid="video-model-select"
      data-value={value}
      data-task={task}
      onClick={() =>
        onChange({
          type: "video_model",
          id: "kling-ref",
          provider: "kie",
          name: "Kling"
        })
      }
    />
  )
}));

import OneTakePanel from "../OneTakePanel";
import { useLastModelStore } from "../../../stores/lastModelStore";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-one-take";

const shot = (overrides: Partial<Shot>): Shot => ({
  type: "shot",
  id: "shot",
  index: 0,
  action: "",
  status: "planned",
  ...overrides
});

const still = (id: string): Shot["keyframe"] => ({
  type: "image",
  uri: `asset://${id}`,
  asset_id: id
});

const SHOTS: Shot[] = [
  shot({
    id: "s1",
    index: 0,
    slug: "Opening",
    action: "A lighthouse at dusk",
    duration_seconds: 5,
    keyframe: still("a1")
  }),
  shot({
    id: "s2",
    index: 1,
    action: "The keeper climbs the stairs",
    motion: "Slow dolly up",
    end_state: "The lamp room door",
    sound: "footsteps",
    duration_seconds: 6,
    keyframe: still("a2")
  }),
  shot({ id: "s3", index: 2, action: "Lamp turns", duration_seconds: 4 })
];

const seed = (
  shots: Shot[],
  oneTake?: OneTakeDirection,
  entityIds: string[] = []
): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  useStoryboardStore.setState((state) => ({
    boards: {
      ...state.boards,
      [BOARD]: {
        ...state.boards[BOARD],
        shots,
        entityIds,
        aspectRatio: "16:9",
        oneTake
      }
    }
  }));
};

const stored = (): OneTakeDirection | undefined =>
  useStoryboardStore.getState().boards[BOARD]?.oneTake;

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <OneTakePanel boardId={BOARD} onClose={jest.fn()} />
    </ThemeProvider>
  );

const compiled = () =>
  screen.getByTestId("one-take-compiled").textContent ?? "";


const pick = async (field: string, option: string): Promise<void> => {
  await userEvent.click(screen.getByRole("combobox", { name: field }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
};

const SEEDANCE = {
  type: "video_model",
  id: "seedance-2",
  provider: "dreamina",
  name: "Seedance",
  supported_tasks: ["reference_to_video"],
  resolutions: ["720p", "1080p"],
  durations: [5, 10, 15],
  aspect_ratios: ["16:9", "9:16"]
};

beforeEach(() => {
  mockVideoModels.length = 0;
  useLastModelStore.setState({ byTask: {}, byKind: {} });
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("OneTakePanel", () => {
  it("shows an empty prompt without writing the board", () => {
    seed(SHOTS);
    renderPanel();

    expect(screen.getByLabelText("Your prompt")).toHaveValue("");
    expect(
      screen.getByText(
        "Brand, rules, light and anything else. Refer to images as [Image N]."
      )
    ).toBeInTheDocument();
    expect(stored()).toBeUndefined();
  });

  it("saves the prompt as the creator types", async () => {
    seed(SHOTS);
    renderPanel();

    await userEvent.type(screen.getByLabelText("Your prompt"), "Harbour Co");

    expect(stored()).toEqual({ prompt: "Harbour Co" });
    expect(screen.getByLabelText("Your prompt")).toHaveValue("Harbour Co");
  });

  it("compiles STEP lines, REFS and AUDIO from the board", () => {
    seed(SHOTS, { prompt: "Warm light." }, ["mark"]);
    renderPanel();

    const text = compiled();
    expect(text).toContain(
      "REFS: [Image 1] is the still of Opening at 0-5s. [Image 2] is the still of shot 2 at 5-11s.\n"
    );
    // The board's entity sends no image: only the stills are referenced.
    expect(text).not.toContain("[Image 3]");
    expect(text).toContain("STEP_01: 0-5s. A lighthouse at dusk.");
    expect(text).toContain(
      "STEP_02: 5-11s. The keeper climbs the stairs. Slow dolly up. End: The lamp room door."
    );
    expect(text).toContain("STEP_03: 11-15s. Lamp turns.");
    expect(text).toContain("AUDIO: <footsteps> at 5-11s");
    // The creator's prompt is not part of the compiled block.
    expect(text).not.toContain("Warm light.");
    expect(screen.getByTestId("one-take-duration")).toHaveTextContent("15s");
  });

  it("lists the image numbering with each label", () => {
    seed(SHOTS, undefined, ["mark"]);
    renderPanel();

    const rows = screen.getAllByTestId("one-take-image");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("[Image 1]")).toBeInTheDocument();
    expect(
      within(rows[0]).getByText("the still of Opening at 0-5s")
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText("[Image 2]")).toBeInTheDocument();
    expect(
      within(rows[1]).getByText("the still of shot 2 at 5-11s")
    ).toBeInTheDocument();
  });

  it("warns past nine images and past thirty seconds", () => {
    const long = Array.from({ length: 10 }, (_, i) =>
      shot({
        id: `l${i}`,
        index: i,
        action: "x",
        duration_seconds: 5,
        keyframe: still(`k${i}`)
      })
    );
    seed(long);
    renderPanel();

    expect(screen.getByTestId("one-take-image-count")).toHaveTextContent(
      "Images 10 / 9"
    );
    expect(screen.getByText("This board has 10 stills. The render sends at most 9.")).toBeInTheDocument();
    expect(screen.getByText(/runs 50s/)).toBeInTheDocument();
  });

  it("does not warn within the limits", () => {
    seed(SHOTS);
    renderPanel();

    expect(screen.getByTestId("one-take-image-count")).toHaveTextContent(
      "Images 2 / 9"
    );
    expect(screen.queryByText(/sends at most/)).not.toBeInTheDocument();
    expect(screen.queryByText(/One take renders at most/)).not.toBeInTheDocument();
  });

  it("saves the picked model and keeps the prompt", async () => {
    seed(SHOTS, { prompt: "Warm light." });
    renderPanel();

    expect(screen.getByTestId("video-model-select")).toHaveAttribute(
      "data-task",
      "reference_to_video"
    );
    await userEvent.click(screen.getByTestId("video-model-select"));

    expect(stored()).toEqual({
      prompt: "Warm light.",
      model: { id: "kling-ref", provider: "kie", name: "Kling" }
    });
    expect(screen.getByTestId("video-model-select")).toHaveAttribute(
      "data-value",
      "kling-ref"
    );
  });

  it("shows the board's video model when none is stored", () => {
    mockVideoModels.push(SEEDANCE);
    seed(SHOTS);
    useStoryboardStore.getState().setVideoModel(BOARD, {
      type: "video_model",
      id: "seedance-2",
      provider: "dreamina",
      name: "Seedance"
    });
    renderPanel();

    expect(screen.getByTestId("video-model-select")).toHaveAttribute(
      "data-value",
      "seedance-2"
    );
  });

  it("saves a duration, keeps the prompt and scales the windows", async () => {
    seed(SHOTS, { prompt: "Warm light." });
    renderPanel();

    expect(screen.getByRole("combobox", { name: "Duration" })).toHaveTextContent(
      "Shot total (15s)"
    );
    expect(screen.queryByText("Shot windows scale to fit.")).not.toBeInTheDocument();

    await pick("Duration", "30s");

    expect(stored()).toEqual({ prompt: "Warm light.", duration_seconds: 30 });
    expect(screen.getByText("Shot windows scale to fit.")).toBeInTheDocument();
    expect(compiled()).toContain("STEP_03: 22-30s. Lamp turns.");
    expect(screen.getByTestId("one-take-duration")).toHaveTextContent("30s");

    await pick("Duration", "Shot total (15s)");
    expect(stored()).toEqual({ prompt: "Warm light.", duration_seconds: null });
    expect(screen.queryByText("Shot windows scale to fit.")).not.toBeInTheDocument();
  });

  it("offers the durations the model declares", async () => {
    mockVideoModels.push(SEEDANCE);
    seed(SHOTS, {
      prompt: "",
      model: { id: "seedance-2", provider: "dreamina" }
    });
    renderPanel();

    await userEvent.click(screen.getByRole("combobox", { name: "Duration" }));
    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent
    );
    expect(options).toEqual(["Shot total (15s)", "5s", "10s", "15s"]);
  });

  it("saves an aspect ratio and keeps the prompt", async () => {
    seed(SHOTS, { prompt: "Warm light." });
    renderPanel();

    expect(
      screen.getByRole("combobox", { name: "Aspect ratio" })
    ).toHaveTextContent("Board (16:9)");
    await pick("Aspect ratio", "1:1 — Square");

    expect(stored()).toEqual({ prompt: "Warm light.", aspect_ratio: "1:1" });
  });

  it("offers the model's aspect ratios when it declares them", async () => {
    mockVideoModels.push(SEEDANCE);
    seed(SHOTS, {
      prompt: "",
      model: { id: "seedance-2", provider: "dreamina" }
    });
    renderPanel();

    await userEvent.click(screen.getByRole("combobox", { name: "Aspect ratio" }));
    const options = (await screen.findAllByRole("option")).map(
      (option) => option.textContent
    );
    expect(options).toEqual([
      "Board (16:9)",
      "16:9 — Widescreen",
      "9:16 — Vertical"
    ]);
  });

  it("saves a resolution and keeps the other settings", async () => {
    seed(SHOTS, { prompt: "Warm light.", duration_seconds: 20 });
    renderPanel();

    expect(
      screen.getByRole("combobox", { name: "Resolution" })
    ).toHaveTextContent("Default (1080p)");
    await pick("Resolution", "720p");

    expect(stored()).toEqual({
      prompt: "Warm light.",
      duration_seconds: 20,
      resolution: "720p"
    });
  });

  it("opens the render dialog", async () => {
    seed(SHOTS);
    renderPanel();

    await userEvent.click(
      screen.getByRole("button", { name: "Render one take…" })
    );

    expect(await screen.findByTestId("one-take-render-dialog")).toHaveTextContent(
      BOARD
    );
  });
});
