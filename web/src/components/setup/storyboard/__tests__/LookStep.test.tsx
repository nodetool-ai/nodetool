/**
 * @jest-environment jsdom
 *
 * Step 3 — aspect ratio and art style (PRD § 7.3, D3, D12).
 *
 * Two claims carry the step and both are about *when* things happen: the stage
 * is written before the first job is enqueued, and picking a style enqueues
 * nothing at all. `Add your own style` adds a third: it only ever creates a
 * new entity, so the preset it started from is untouched (§ 7.7.9).
 */
import React from "react";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within
} from "@testing-library/react";
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
  useRenderBatchCostEstimate: (_boardId: string, shots: Shot[]) => ({
    shotCount: shots.length,
    cost: shots.length * 0.02,
    pricedCount: shots.length,
    reasons: [],
    notes: []
  })
}));

let library: Entity[] = [];
const saveEntity = jest.fn(
  async (input: {
    assetId: string;
    kind: string;
    name: string;
    descriptor: string;
  }): Promise<Entity> => ({
    type: "entity",
    id: "e-mine",
    kind: "style",
    name: input.name,
    descriptor: input.descriptor
  })
);
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: library }),
  useSaveEntity: () => ({ mutateAsync: saveEntity })
}));

/** The reference upload: the first picture becomes the entity's own asset. */
const uploadAsset = jest.fn(
  (file: { onCompleted?: (asset: { id: string }) => void }) => {
    file.onCompleted?.({ id: "asset-ref-1" });
  }
);
jest.mock("../../../../serverState/useAssetUpload", () => ({
  useAssetUpload: { getState: () => ({ uploadAsset }) }
}));

/** What the language model answers when it is shown the references. */
const rpcRequest = jest.fn(
  async (
    _command: string,
    _data: Record<string, unknown>
  ): Promise<{ data: Record<string, unknown> }> => ({
    data: {
      name: "Sun-bleached Super 8",
      descriptor: "Grainy 16mm, warm halation."
    }
  })
);
jest.mock("../../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (command: string, data: Record<string, unknown>) =>
    rpcRequest(command, data)
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

// The still-model picker reads the image-model catalog through TanStack
// Query; this suite stands up no client. What the picker itself does is
// pinned by `StillModelField` tests below, through the store.
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  __esModule: true,
  useImageModelsByProvider: () => ({ models: [], isLoading: false })
}));
jest.mock("../../../properties/ImageModelSelect", () => ({
  __esModule: true,
  default: ({
    value,
    onChange
  }: {
    value: string;
    onChange: (v: {
      type: "image_model";
      id: string;
      provider: string;
      name: string;
      path: string;
    }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          type: "image_model",
          id: "picked-still",
          provider: "fal_ai",
          name: "Picked",
          path: ""
        })
      }
    >
      {`still:${value}`}
    </button>
  )
}));

import mockTheme from "../../../../__mocks__/themeMock";
import { StudioProvider } from "../../../../studio/StudioContext";
import { LookStep, useLookStep } from "../LookStep";
import { useCustomStyle } from "../useCustomStyle";
import { clearSetupReports, setShotlistImport } from "../setupChoices";
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
      <LookStep boardId={BOARD} />
    </ThemeProvider>
  );

beforeEach(() => {
  stageWhenEnqueued.length = 0;
  generateKeyframe.mockClear();
  saveEntity.mockClear();
  uploadAsset.mockClear();
  rpcRequest.mockClear();
  presets = [NOIR, COMIC];
  library = [asEntity(NOIR), asEntity(COMIC)];
  useStoryboardStore.setState({ boards: {}, history: {} } as never);
  clearSetupReports(BOARD);
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
  it.each([
    [
      "cinematic",
      "Anamorphic 40mm at T2, amber key.",
      "Warm light, cool shadows, softly blurred backgrounds and fine film grain."
    ],
    [
      "animation-3d",
      "Stylised 3D render with rounded, slightly oversized forms.",
      "Rounded, oversized forms with matte surfaces and soft daylight."
    ],
    [
      "flat-vector",
      "Flat vector shapes with no outlines, a five-colour palette.",
      "Simple geometric shapes without outlines, flat colours and open space."
    ],
    [
      "custom",
      "Rounded, painted forms. Warm shadows.",
      "Rounded, painted forms. Warm shadows."
    ]
  ])(
    "shows complete display copy for %s without changing the descriptor",
    async (presetId, descriptor, description) => {
      const user = userEvent.setup();
      presets = [{ ...NOIR, presetId, descriptor }];
      library = presets.map(asEntity);
      renderStep();
      expect(screen.getByText(description)).toBeInTheDocument();
      await user.click(screen.getByRole("radio", { name: /Noir/ }));
      expect(board().style).toBe(descriptor);
      expect(generateKeyframe).not.toHaveBeenCalled();
    }
  );

  it("renders one tile per shipped preset plus Add your own style", () => {
    renderStep();

    expect(screen.getByRole("radio", { name: /Noir/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Comic/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add your own style/ })
    ).toBeInTheDocument();
  });

  it("applies a preset as one style entity and its descriptor", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("radio", { name: /Noir/ }));

    expect(board().entityIds).toEqual([NOIR.entityId]);
    expect(board().style).toBe(NOIR.descriptor);
  });

  it("replaces the previous style rather than casting a second one", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("radio", { name: /Noir/ }));
    await user.click(screen.getByRole("radio", { name: /Comic/ }));

    expect(board().entityIds).toEqual([COMIC.entityId]);
    expect(board().style).toBe(COMIC.descriptor);
  });

  it("marks the applied preset as the selected tile", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("radio", { name: /Comic/ }));

    expect(screen.getByRole("radio", { name: /Comic/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  // F26: a style is one choice among the shipped presets. The trailing
  // `Add your own style` opens a dialog, so it stays a plain button and is
  // deliberately not a member of the group.
  it("announces the style tiles as one exclusive choice", async () => {
    const user = userEvent.setup();
    renderStep();

    const grid = screen.getByRole("radiogroup", { name: "Art style" });
    const tiles = within(grid).getAllByRole("radio");
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      expect.stringContaining("Noir"),
      expect.stringContaining("Comic")
    ]);
    expect(grid.querySelector("[aria-pressed]")).toBeNull();

    await user.click(screen.getByRole("radio", { name: /Noir/ }));

    expect(
      within(grid)
        .getAllByRole("radio")
        .filter((tile) => tile.getAttribute("aria-checked") === "true")
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: /Add your own style/ })
    ).not.toHaveAttribute("aria-checked");
  });

  // D12: a style change marks versions stale; it never starts a render.
  it("renders nothing when a preset is picked", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("radio", { name: /Noir/ }));
    await user.click(screen.getByRole("radio", { name: /Comic/ }));

    expect(generateKeyframe).not.toHaveBeenCalled();
    expect(board().setupStage).toBe("look");
  });

  it("falls back to a typographic tile when the thumbnail does not resolve", () => {
    presets = [NOIR];
    library = presets.map(asEntity);
    renderStep();

    // The picture sits beside the radio in the tile, not inside it, so the
    // grid is what holds the sample.
    const grid = screen.getByRole("radiogroup", { name: "Art style" });
    const image = grid.querySelector("img");
    expect(image).not.toBeNull();

    act(() => {
      image?.dispatchEvent(new Event("error", { bubbles: false }));
    });

    expect(grid.querySelector("img")).toBeNull();
    expect(screen.getByRole("radio", { name: /Noir/ })).toHaveTextContent(
      "Noir"
    );
  });

  // F19: a style the creator just made is not one of the shipped twelve, and
  // the grid used to show nothing selected the moment it was applied.
  it("shows a custom style as a selected tile with its own name", () => {
    const mine: Entity = {
      type: "entity",
      id: "e-mine",
      kind: "style",
      name: "Sun-bleached Super 8",
      descriptor: "Grainy 16mm, warm halation."
    };
    library = [asEntity(NOIR), asEntity(COMIC), mine];
    useStoryboardStore.getState().loadBoard(BOARD, {
      ...board(),
      entityIds: [mine.id],
      style: mine.descriptor
    } as never);
    renderStep();

    expect(
      screen.getByRole("radio", { name: /Sun-bleached Super 8/ })
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(/Applied: Sun-bleached Super 8/)
    ).toBeInTheDocument();
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

  // The one spending click names the model it spends on. Without one the
  // request would fall back to a server default nothing on screen mentions.
  it("stays disabled until a still model is picked, and says so", () => {
    const { result, rerender } = renderHook(() => useLookStep(BOARD));

    expect(result.current.canAdvance).toBe(false);
    expect(result.current.blockedReason).toBe("Pick a still model");

    act(() => {
      useStoryboardStore.getState().setImageModel(BOARD, {
        type: "image_model",
        id: "picked-still",
        provider: "fal_ai",
        name: "Picked",
        path: ""
      });
    });
    rerender();

    expect(result.current.canAdvance).toBe(true);
    expect(result.current.blockedReason).toBeUndefined();
  });

  it("names the missing art style before the missing model", () => {
    useStoryboardStore.getState().setStyle(BOARD, "");
    const { result } = renderHook(() => useLookStep(BOARD));

    expect(result.current.blockedReason).toBe("Pick an art style");
  });
});

describe("LookStep — style tiles", () => {
  // The art is not shipped, so a tile is a text card. A bare name says
  // nothing about the look it stands for. The line is written for a reader,
  // not cut out of the prompt descriptor, so it is a whole sentence.
  it("says what each style looks like, in plain words", () => {
    renderStep();

    expect(
      screen.getByText(
        "Black and white, hard light, deep shadows and heavy film grain."
      )
    ).toBeInTheDocument();
  });
});

describe("LookStep — still model", () => {
  // Studio's curated dropdown prints the model's own blurb underneath, so the
  // field's own helper line would stack a second, quieter line under the same
  // control.
  it("drops its helper line in Studio, where the control carries one", () => {
    const { unmount } = renderStep();
    expect(
      screen.getByText(
        "Draws every keyframe. The estimate beside the button follows it."
      )
    ).toBeInTheDocument();
    unmount();

    render(
      <ThemeProvider theme={mockTheme}>
        <StudioProvider>
          <LookStep boardId={BOARD} />
        </StudioProvider>
      </ThemeProvider>
    );

    expect(
      screen.queryByText(
        "Draws every keyframe. The estimate beside the button follows it."
      )
    ).not.toBeInTheDocument();
  });

  it("writes the picked still model onto the board", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("button", { name: "still:" }));

    expect(board().imageModel?.id).toBe("picked-still");
  });

  // No tile matches the Director's free text, so the grid reads as "nothing
  // chosen" while the board carries a look.
  it("shows the look the Director wrote when no preset is selected", () => {
    renderStep();

    expect(
      screen.getByText(/Your Director wrote the look: grainy 16mm, salt haze/)
    ).toBeInTheDocument();
  });

  it("drops that line once a preset is picked", async () => {
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getByRole("radio", { name: /Noir/ }));

    expect(
      screen.queryByText(/Your Director wrote the look/)
    ).not.toBeInTheDocument();
  });
});

describe("LookStep — Add your own style", () => {
  /** The board arrives on a preset and with a model, as step 2 leaves it. */
  const seedOnNoir = (): void => {
    const current = board();
    useStoryboardStore.getState().loadBoard(BOARD, {
      ...current,
      entityIds: [NOIR.entityId],
      style: NOIR.descriptor,
      directorModel: { type: "language_model", provider: "openai", id: "gpt-5" }
    } as never);
  };

  const addOwnStyle = async (): Promise<void> => {
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Add your own style/ })
    );
    await user.upload(
      screen.getByLabelText("Reference images"),
      new File(["ref"], "ref.png", { type: "image/png" })
    );
    await user.click(screen.getByRole("button", { name: "Add style" }));
  };

  it("saves the model's descriptor as a user entity and applies it", async () => {
    seedOnNoir();
    renderStep();

    await addOwnStyle();

    await waitFor(() => expect(board().entityIds).toEqual(["e-mine"]));
    expect(board().style).toBe("Grainy 16mm, warm halation.");
    expect(saveEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        assetId: "asset-ref-1",
        kind: "style",
        name: "Sun-bleached Super 8"
      })
    );
    // The references reach the model as content blocks, not as prose.
    const request = rpcRequest.mock.calls[0][1] as unknown as {
      messages: Array<{ content: unknown }>;
    };
    const content = request.messages[1].content as Array<{ type: string }>;
    expect(content.map((block) => block.type)).toEqual(["text", "image_url"]);
  });

  // § 7.7.9: a preset's descriptor never changes under a user.
  it("leaves the preset it was started from untouched", async () => {
    seedOnNoir();
    const before = JSON.stringify(library);
    renderStep();

    await addOwnStyle();

    await waitFor(() => expect(board().entityIds).toEqual(["e-mine"]));
    expect(JSON.stringify(library)).toBe(before);
    expect(
      library.find((entity) => entity.id === NOIR.entityId)?.descriptor
    ).toBe(NOIR.descriptor);
  });

  it("keeps the board's style when the model describes nothing", async () => {
    seedOnNoir();
    rpcRequest.mockResolvedValueOnce({ data: { name: "", descriptor: "" } });
    renderStep();

    await addOwnStyle();

    expect(
      await screen.findByText("The model did not describe these references.")
    ).toBeInTheDocument();
    expect(board().entityIds).toEqual([NOIR.entityId]);
    expect(board().style).toBe(NOIR.descriptor);
    expect(saveEntity).not.toHaveBeenCalled();
  });
});

describe("LookStep — a shotlist import", () => {
  // F29: the rows are already on the board, so the report is a line on the
  // step rather than a dialog in the way.
  it("summarises the import inline and expands what it discarded", async () => {
    const user = userEvent.setup();
    setShotlistImport(BOARD, {
      shotCount: 3,
      entries: [
        {
          row: 2,
          column: "size",
          value: "mega-wide",
          reason: "not one of the shot sizes"
        }
      ]
    });
    renderStep();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("3 shots are on your board.")).toBeInTheDocument();
    expect(screen.getByText(/mega-wide/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(
      screen.queryByText("3 shots are on your board.")
    ).not.toBeInTheDocument();
  });
});

describe("LookStep — the step heading", () => {
  // F32: the step names itself before it asks for anything.
  it("opens with its heading and subline", () => {
    renderStep();

    expect(
      screen.getByRole("heading", {
        name: "Choose your aspect ratio and art style"
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Set the look with a preset or your own references/)
    ).toBeInTheDocument();
  });
});

describe("useCustomStyle — one call per confirmation", () => {
  // F18: `saving` reaches the dialog a render after the click, so the guard
  // that stops a second call is a ref, not the state.
  it("refuses a second submission while the first is in flight", async () => {
    useStoryboardStore.getState().loadBoard(BOARD, {
      ...board(),
      directorModel: { type: "language_model", provider: "openai", id: "gpt-5" }
    } as never);
    const file = new File(["ref"], "ref.png", { type: "image/png" });
    const { result } = renderHook(() => useCustomStyle(BOARD));

    // Two presses in one tick — the window the ref closes and the `saving`
    // state, which lands a render later, cannot.
    let second = true;
    await act(async () => {
      const first = result.current.addStyle([file]);
      second = await result.current.addStyle([file]);
      await first;
    });

    expect(second).toBe(false);
    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(saveEntity).toHaveBeenCalledTimes(1);
  });
});
