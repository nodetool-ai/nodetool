/**
 * Criterion 14, against the real storyboard store: the panel edits every
 * field in § 7.7.2, `Save` is one undo step, closing dirty asks, `Regenerate`
 * renders from the saved values, dialogue is read-only on a linked board, and
 * the ERT chip toggles `duration_source`.
 *
 * The store is real because the undo assertion is the point: one `undo()` has
 * to put every edited field back, which a mocked `updateShot` cannot show.
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Scene, Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

const generateKeyframeMock = jest.fn(async () => undefined);
const generateClipMock = jest.fn(async () => undefined);
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: generateKeyframeMock,
    generateClip: generateClipMock,
    generateRevisedClip: jest.fn(async () => undefined)
  })
}));

// The linked script: one line, voiced with a 3.4 s take plus 250 ms silence,
// so an unpinned ERT reads 4 s from the takes.
let lineIsVoiced = true;
jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: {
      get: {
        useQuery: (_input: { id: string }, options?: { enabled?: boolean }) =>
          options?.enabled
            ? {
                data: {
                  document: {
                    cast: [],
                    sections: [
                      {
                        id: "sec1",
                        lines: [
                          {
                            id: "line-1",
                            text: "We are closed.",
                            pauseAfterMs: 250,
                            currentTakeId: lineIsVoiced ? "take-1" : null,
                            takes: lineIsVoiced
                              ? [
                                  {
                                    id: "take-1",
                                    assetId: "audio-1",
                                    durationMs: 3400,
                                    words: [],
                                    textSnapshot: "We are closed.",
                                    voiceSnapshot: null,
                                    createdAt: "2026-01-01T00:00:00.000Z"
                                  }
                                ]
                              : []
                          }
                        ]
                      }
                    ]
                  }
                }
              }
            : { data: undefined }
      }
    }
  },
  trpcClient: {}
}));

jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));

// Pricing reaches the provider catalogs; the cost line has no bearing here.
jest.mock("../../../hooks/storyboard/useShotCostEstimate", () => ({
  __esModule: true,
  useShotCostEstimate: () => ({ source: "models", cost: 0, steps: [], notes: [] }),
  default: () => ({ source: "models", cost: 0, steps: [], notes: [] })
}));

// Each has its own suite; both reach for media and the script store.
const stub = (name: string) => ({
  __esModule: true,
  default: () => <div data-testid={name} />
});
jest.mock("../ShotEditViewer", () => stub("shot-edit-viewer"));
jest.mock("../ShotTakesGallery", () => stub("takes-gallery"));
jest.mock("../ShotScriptPanel", () => stub("script-panel"));

import ShotEditPanel from "../ShotEditPanel";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const BOARD = "board-edit";

const baseShot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "shot-1",
  index: 0,
  slug: "Opening",
  action: "A lighthouse at dusk",
  status: "planned",
  scene_id: "sc1",
  ...overrides
});

const SCENES: Scene[] = [
  { type: "scene", id: "sc1", slugline: "EXT. HARBOUR — DUSK", lighting: "" },
  { type: "scene", id: "sc2", slugline: "INT. LAMP ROOM — NIGHT", lighting: "" }
];

/** Seed the board through the real store and return the shot it holds. */
const seed = (
  shots: Shot[],
  screenplay: { script_id?: string } = {}
): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.loadBoard(BOARD, {
    screenplay: {
      type: "screenplay",
      id: "screenplay-1",
      title: "Board",
      logline: "",
      shots,
      scenes: SCENES,
      ...screenplay
    },
    shots,
    title: "Board",
    brief: "",
    style: "",
    entityIds: [],
    aspectRatio: "9:16",
    setupStage: "done",
    genre: "",
    directorModel: null,
    imageModel: null,
    videoModel: null,
    activeShotId: null,
    timelineId: null
  });
};

const storedShot = (id = "shot-1"): Shot => {
  const found = useStoryboardStore
    .getState()
    .boards[BOARD]?.shots.find((s) => s.id === id);
  if (!found) {
    throw new Error(`shot ${id} is not on the board`);
  }
  return found;
};

const onClose = jest.fn();
const onShotChange = jest.fn();

const renderPanel = (
  props: Partial<React.ComponentProps<typeof ShotEditPanel>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ShotEditPanel
        boardId={BOARD}
        shotId="shot-1"
        onClose={onClose}
        onShotChange={onShotChange}
        {...props}
      />
    </ThemeProvider>
  );

/** Pick `option` out of the select whose accessible name is `label`. */
const choose = async (label: string, option: string) => {
  await userEvent.click(screen.getByLabelText(label));
  await userEvent.click(
    await within(await screen.findByRole("listbox")).findByRole("option", {
      name: option
    })
  );
};

const typeInto = async (label: string, text: string) => {
  const field = screen.getByLabelText(label);
  await userEvent.clear(field);
  await userEvent.type(field, text);
};

beforeEach(() => {
  onClose.mockClear();
  onShotChange.mockClear();
  generateKeyframeMock.mockClear();
  generateClipMock.mockClear();
  lineIsVoiced = true;
});

afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("ShotEditPanel fields (criterion 14)", () => {
  it("shows the derived numbering and the board's aspect ratio read-only", () => {
    seed([baseShot(), baseShot({ id: "shot-2", index: 1, scene_id: "sc2" })]);
    renderPanel();

    // Scene 1, Shot 1 — both derived from `shot.index`, neither editable.
    expect(screen.getByTestId("cell-scene")).toHaveTextContent("1");
    expect(screen.getByTestId("cell-shot")).toHaveTextContent("1");
    // The ratio is the board's, so it is shown with the way to change it.
    expect(screen.getByTestId("cell-aspect-ratio")).toHaveTextContent("9:16");
    expect(screen.getByText("Set in Board settings")).toBeInTheDocument();
  });

  it("links to the board's settings form when the caller can open one", () => {
    seed([baseShot()]);
    const onOpenBoardSettings = jest.fn();
    renderPanel({ onOpenBoardSettings });
    expect(
      screen.getByRole("button", { name: "Board settings" })
    ).toBeEnabled();
  });

  it("numbers a shot by its scene, not by its position on the board", () => {
    seed([baseShot(), baseShot({ id: "shot-2", index: 1, scene_id: "sc2" })]);
    renderPanel({ shotId: "shot-2" });
    expect(screen.getByTestId("cell-scene")).toHaveTextContent("2");
    expect(screen.getByTestId("cell-shot")).toHaveTextContent("1");
  });

  it("edits every § 7.7.2 field and saves them in one write", async () => {
    seed([baseShot()]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await typeInto("Dialogue", "We are open.");
    await typeInto("Estimated running time in seconds", "7");
    await choose("Size", "wide");
    await choose("Perspective", "low angle");
    await choose("Movement", "pan left");
    await choose("Equipment", "steadicam");
    await choose("Focal length", "35mm");
    await userEvent.click(screen.getByRole("button", { name: "Add +" }));
    await typeInto("Notes", "Keep the gulls");
    await typeInto("Shot title", "Dawn");

    // Nothing has reached the board yet — the rows are a draft (D11).
    expect(storedShot().action).toBe("A lighthouse at dusk");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(storedShot()).toMatchObject({
      slug: "Dawn",
      action: "A lighthouse at dawn",
      dialogue: "We are open.",
      notes: "Keep the gulls",
      duration_seconds: 7,
      camera: {
        framing: "wide",
        angle: "low angle",
        movement: "pan left",
        equipment: "steadicam",
        lens: "35mm"
      }
    });
  });

  it("puts every edited field back with a single undo", async () => {
    seed([baseShot()]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await choose("Size", "wide");
    await typeInto("Estimated running time in seconds", "7");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(storedShot().camera?.framing).toBe("wide");

    useStoryboardStore.getState().undo(BOARD);

    expect(storedShot().action).toBe("A lighthouse at dusk");
    expect(storedShot().duration_seconds).toBeUndefined();
    expect(storedShot().camera).toBeUndefined();
  });

  it("moves the shot to the chosen scene and writes that scene's lighting", async () => {
    seed([baseShot(), baseShot({ id: "shot-2", index: 1, scene_id: "sc2" })]);
    renderPanel();

    await choose("Slugline", "INT. LAMP ROOM — NIGHT");
    await typeInto("Scene lighting", "sodium wash");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(storedShot().scene_id).toBe("sc2");
    const scenes =
      useStoryboardStore.getState().boards[BOARD]?.screenplay?.scenes ?? [];
    expect(scenes.find((s) => s.id === "sc2")?.lighting).toBe("sodium wash");
  });
});

describe("ShotEditPanel overflow actions", () => {
  const openOverflow = async () => {
    await userEvent.click(
      screen.getByRole("button", { name: "More shot actions" })
    );
  };

  it("reorders inside the scene, which the board only offers by drag", async () => {
    seed([
      baseShot(),
      baseShot({ id: "shot-2", index: 1, slug: "Second", action: "The lamp" })
    ]);
    renderPanel({ shotId: "shot-2" });

    await openOverflow();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Move earlier in scene" })
    );

    expect(storedShot("shot-2").index).toBe(0);
    expect(storedShot("shot-1").index).toBe(1);
  });

  it("saves before rendering a clip, so the render reads the saved fields", async () => {
    seed([
      baseShot({
        status: "keyframe_ready",
        keyframe: { type: "image", uri: "asset://still-1", asset_id: "still-1" }
      })
    ]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await openOverflow();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Render clip" })
    );

    expect(storedShot().action).toBe("A lighthouse at dawn");
    expect(generateClipMock).toHaveBeenCalledWith(
      BOARD,
      expect.objectContaining({ action: "A lighthouse at dawn" })
    );
  });
});

describe("ShotEditPanel save semantics", () => {
  it("asks before closing with unsaved edits, and discards on Discard", async () => {
    seed([baseShot()]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).not.toHaveBeenCalled();
    const confirm = await screen.findByText("Discard changes?");
    await userEvent.click(
      within(confirm.closest("[role='dialog']") as HTMLElement).getByRole(
        "button",
        { name: "Discard" }
      )
    );

    expect(onClose).toHaveBeenCalled();
    expect(storedShot().action).toBe("A lighthouse at dusk");
  });

  it("saves and closes when the confirm's Save is taken", async () => {
    seed([baseShot()]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    const confirm = await screen.findByText("Discard changes?");
    await userEvent.click(
      within(confirm.closest("[role='dialog']") as HTMLElement).getByRole(
        "button",
        { name: "Save" }
      )
    );

    expect(storedShot().action).toBe("A lighthouse at dawn");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes without asking when nothing was edited", async () => {
    seed([baseShot()]);
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("renders from the saved values, not the ones on screen before Save", async () => {
    seed([baseShot()]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await userEvent.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(storedShot().action).toBe("A lighthouse at dawn");
    expect(generateKeyframeMock).toHaveBeenCalledWith(
      BOARD,
      expect.objectContaining({ action: "A lighthouse at dawn" })
    );
  });
});

describe("ShotEditPanel keyboard", () => {
  it("saves on Cmd/Ctrl+S", async () => {
    seed([baseShot()]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await userEvent.keyboard("{Control>}s{/Control}");

    expect(storedShot().action).toBe("A lighthouse at dawn");
  });

  // PRD § 7.5 gives the arrows to the version pager, which lives in the viewer
  // (stubbed here). The shell must not also claim them: it used to step shots,
  // which silently swapped the shot under an open draft.
  it("leaves the arrow keys to the viewer's pager", async () => {
    seed([
      baseShot(),
      baseShot({
        id: "shot-2",
        index: 1,
        slug: "Second",
        action: "The lamp turns"
      })
    ]);
    renderPanel();

    expect(screen.getByLabelText("Description")).toHaveValue(
      "A lighthouse at dusk"
    );
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "A lighthouse at dusk"
    );

    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByLabelText("Description")).toHaveValue(
      "A lighthouse at dusk"
    );
  });

  it("closes on Esc, asking when dirty", async () => {
    seed([baseShot()]);
    renderPanel();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();

    onClose.mockClear();
    await typeInto("Description", "A lighthouse at dawn");
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
  });
});

describe("ShotEditPanel on a linked board (PRD D9)", () => {
  const linked = () =>
    seed(
      [baseShot({ script_line_ids: ["line-1"], dialogue: "We are closed." })],
      { script_id: "script-1" }
    );

  it("shows the dialogue read-only with a way into the script", () => {
    linked();
    renderPanel();

    expect(screen.queryByLabelText("Dialogue")).not.toBeInTheDocument();
    expect(screen.getByTestId("shot-dialogue-readonly")).toHaveTextContent(
      "We are closed."
    );
    expect(
      screen.getByRole("button", { name: "Edit in script" })
    ).toBeEnabled();
  });

  it("pins the length when one is typed, and unpins from the chip", async () => {
    linked();
    renderPanel();

    // 3400 ms + 250 ms of silence, rounded up — the takes' own duration.
    expect(
      screen.getByLabelText("Estimated running time in seconds")
    ).toHaveAttribute("placeholder", "4");
    expect(screen.getByText("from takes")).toBeInTheDocument();

    await typeInto("Estimated running time in seconds", "9");
    expect(screen.getByText("pinned")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(storedShot()).toMatchObject({
      duration_seconds: 9,
      duration_source: "manual"
    });

    // The chip hands timing back to the takes; the typed value stays put so
    // it can be pinned again.
    await userEvent.click(screen.getByText("pinned"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(storedShot().duration_source).toBe("audio");
    expect(
      screen.getByLabelText("Estimated running time in seconds")
    ).toHaveValue(9);
  });
});

describe("ShotEditPanel placement (it is a row of the board, not a dialog)", () => {
  it("asks the board to move it rather than swapping the shot under itself", async () => {
    seed([
      baseShot(),
      baseShot({ id: "shot-2", index: 1, slug: "Second", action: "The lamp" })
    ]);
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: "Next shot" }));

    expect(onShotChange).toHaveBeenCalledWith("shot-2");
    // Still on shot-1: where the panel sits is the board's call.
    expect(screen.getByLabelText("Description")).toHaveValue(
      "A lighthouse at dusk"
    );
  });

  it("asks about an unsaved draft before stepping away", async () => {
    seed([baseShot(), baseShot({ id: "shot-2", index: 1, slug: "Second" })]);
    renderPanel();

    await typeInto("Description", "A lighthouse at dawn");
    await userEvent.click(screen.getByRole("button", { name: "Next shot" }));

    expect(onShotChange).not.toHaveBeenCalled();
    const confirm = await screen.findByText("Discard changes?");
    await userEvent.click(
      within(confirm.closest("[role='dialog']") as HTMLElement).getByRole(
        "button",
        { name: "Discard" }
      )
    );
    expect(onShotChange).toHaveBeenCalledWith("shot-2");
    expect(storedShot().action).toBe("A lighthouse at dusk");
  });

  it("offers no stepping when the board cannot move it", () => {
    seed([baseShot(), baseShot({ id: "shot-2", index: 1, slug: "Second" })]);
    renderPanel({ onShotChange: undefined });
    expect(
      screen.queryByRole("button", { name: "Next shot" })
    ).not.toBeInTheDocument();
  });
});
