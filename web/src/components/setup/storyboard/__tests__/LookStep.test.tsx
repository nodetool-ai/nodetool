/**
 * @jest-environment jsdom
 *
 * Step 3 — aspect ratio and art style (PRD § 7.3, D3, D12).
 *
 * Two claims carry the step and both are about *when* things happen: the stage
 * is written before the first job is enqueued, and picking a style enqueues
 * nothing at all.
 */
import React from "react";
import { render, renderHook, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity, Shot } from "@nodetool-ai/protocol";

jest.mock("../../../../hooks/useResolvedMediaUri");

/** Records the board's persisted stage at the moment each job is enqueued. */
const stageWhenEnqueued: string[] = [];
const generateKeyframe = jest.fn(async (boardId: string, _shot: Shot) => {
  stageWhenEnqueued.push(
    useStoryboardStore.getState().getBoard(boardId)?.setupStage ?? "missing"
  );
});
jest.mock("../../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe,
    generateClip: jest.fn(),
    generateRevisedClip: jest.fn()
  })
}));

jest.mock("../../../../hooks/storyboard/useRenderBatchCostEstimate", () => ({
  useRenderBatchCostEstimate: (
    _boardId: string,
    shots: Shot[]
  ) => ({
    shotCount: shots.length,
    cost: shots.length * 0.02,
    pricedCount: shots.length,
    reasons: [],
    notes: []
  })
}));

let library: Entity[] = [];
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: library })
}));

let presets: Array<{
  entityId: string;
  presetId: string;
  name: string;
  descriptor: string;
  thumbnail: string;
}> = [];
jest.mock("../../../../serverState/useStylePresets", () => ({
  useStylePresets: () => ({ data: presets })
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { LookStep, useLookStep } from "../LookStep";
import { ASPECT_OPTIONS } from "../../../storyboard/aspectOptions";
import {
  useStoryboardStore,
  type StoryboardBoard
} from "../../../../stores/storyboard/StoryboardStore";

const BOARD = "board-look";

const NOIR = {
  entityId: "e-noir",
  presetId: "noir",
  name: "Noir",
  descriptor: "High-contrast black and white, one hard key.",
  thumbnail: "package://nodetool-base/styles/noir.jpg"
};
const COMIC = {
  entityId: "e-comic",
  presetId: "comic",
  name: "Comic",
  descriptor: "Bold black ink outlines over flat cel colour.",
  thumbnail: "package://nodetool-base/styles/comic.jpg"
};

const asEntity = (preset: typeof NOIR): Entity => ({
  type: "entity",
  id: preset.entityId,
  kind: "style",
  name: preset.name,
  descriptor: preset.descriptor
});

const shot = (id: string, index: number): Shot => ({
  type: "shot",
  id,
  index,
  action: `beat ${index}`,
  status: "planned"
});

const board = (): StoryboardBoard => {
  const found = useStoryboardStore.getState().getBoard(BOARD);
  if (!found) throw new Error("board vanished");
  return found;
};

/**
 * A board arriving at step 3 the way step 2 leaves it: directed, and already
 * carrying a `style` copied from the Director's style bible.
 */
const seed = (): void => {
  useStoryboardStore.getState().loadBoard(BOARD, {
    screenplay: null,
    shots: [shot("s1", 0), shot("s2", 1)],
    title: "Dark Water",
    brief: "A lighthouse keeper loses the light.",
    style: "grainy 16mm, salt haze",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "look",
    genre: "Thriller",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

const renderStep = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <LookStep boardId={BOARD} onAddOwnStyle={jest.fn()} />
    </ThemeProvider>
  );

beforeEach(() => {
  stageWhenEnqueued.length = 0;
  generateKeyframe.mockClear();
  presets = [NOIR, COMIC];
  library = [asEntity(NOIR), asEntity(COMIC)];
  useStoryboardStore.setState({ boards: {}, history: {} } as never);
  seed();
});

describe("LookStep — aspect ratio", () => {
  it("offers the board's five ratios and writes the choice", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("combobox", { name: /Aspect ratio/ }));
    for (const option of ASPECT_OPTIONS) {
      expect(
        screen.getByRole("option", { name: option.label })
      ).toBeInTheDocument();
    }

    await user.click(screen.getByRole("option", { name: /9:16/ }));
    expect(board().aspectRatio).toBe("9:16");
  });
});

describe("LookStep — style presets", () => {
  it("renders one tile per shipped preset plus Add your own style", () => {
    renderStep();

    expect(screen.getByRole("button", { name: /Noir/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comic/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add your own style/ })
    ).toBeInTheDocument();
  });

  it("applies a preset as one style entity and its descriptor", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("button", { name: /Noir/ }));

    expect(board().entityIds).toEqual([NOIR.entityId]);
    expect(board().style).toBe(NOIR.descriptor);
  });

  it("replaces the previous style rather than casting a second one", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("button", { name: /Noir/ }));
    await user.click(screen.getByRole("button", { name: /Comic/ }));

    expect(board().entityIds).toEqual([COMIC.entityId]);
    expect(board().style).toBe(COMIC.descriptor);
  });

  it("marks the applied preset as the selected tile", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("button", { name: /Comic/ }));

    expect(screen.getByRole("button", { name: /Comic/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  // D12: a style change marks versions stale; it never starts a render.
  it("renders nothing when a preset is picked", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("button", { name: /Noir/ }));
    await user.click(screen.getByRole("button", { name: /Comic/ }));

    expect(generateKeyframe).not.toHaveBeenCalled();
    expect(board().setupStage).toBe("look");
  });

  it("falls back to a typographic tile when the thumbnail does not resolve", () => {
    renderStep();

    const tile = screen.getByRole("button", { name: /Noir/ });
    const image = tile.querySelector("img");
    expect(image).not.toBeNull();

    act(() => {
      image?.dispatchEvent(new Event("error", { bubbles: false }));
    });

    expect(tile.querySelector("img")).toBeNull();
    expect(tile).toHaveTextContent("Noir");
  });
});

describe("useLookStep — Generate your storyboard", () => {
  it("writes stage done before the first job is enqueued", async () => {
    const { result } = renderHook(() => useLookStep(BOARD));

    await act(async () => {
      await result.current.generate();
    });

    expect(generateKeyframe).toHaveBeenCalledTimes(2);
    // D3: every enqueue saw the terminal stage already persisted.
    expect(stageWhenEnqueued).toEqual(["done", "done"]);
    expect(board().setupStage).toBe("done");
  });

  it("does not advance the stage just because style is non-empty", () => {
    // step 2 leaves `style` set from the Director's style bible.
    expect(board().style).not.toBe("");
    renderHook(() => useLookStep(BOARD));

    expect(board().setupStage).toBe("look");
  });

  it("prices exactly the shots it will render", () => {
    const { result } = renderHook(() => useLookStep(BOARD));

    expect(result.current.primaryDetail).toBe("2 stills · about $0.04");
  });

  it("skips a shot that already has a still", async () => {
    useStoryboardStore.getState().loadBoard(BOARD, {
      ...board(),
      shots: [
        { ...shot("s1", 0), keyframe: { type: "image", asset_id: "a1" } },
        shot("s2", 1)
      ]
    } as never);
    const { result } = renderHook(() => useLookStep(BOARD));

    await act(async () => {
      await result.current.generate();
    });

    expect(generateKeyframe).toHaveBeenCalledTimes(1);
    expect(generateKeyframe.mock.calls[0][1].id).toBe("s2");
  });

  it("stays disabled until a style is on the board", () => {
    useStoryboardStore.getState().setStyle(BOARD, "");
    const { result } = renderHook(() => useLookStep(BOARD));

    expect(result.current.canAdvance).toBe(false);
  });
});
