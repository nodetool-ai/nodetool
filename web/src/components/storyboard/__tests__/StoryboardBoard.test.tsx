import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Entity, Scene, Shot } from "@nodetool-ai/protocol";
import { isVersionStale } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../hooks/useResolvedMediaUri");

let mockShots: Shot[] = [];
/** The board's scene records; empty is a legacy board (PRD § 7.7.7). */
let mockScenes: Scene[] = [];
/** The board's stored genre label. */
let mockGenre = "";
/** The board's selected shot id, driving the inspector's presence. */
let activeShot: string | null = null;
/** The board's render models. Null on both leaves the toolbar unpriced. */
let boardModels: { imageModel: unknown; videoModel: unknown } = {
  imageModel: null,
  videoModel: null
};

type PriceParams = { resolution?: string; seconds?: number };
const mockPrice = jest.fn(
  (_model: unknown, _params: PriceParams): unknown => null
);
jest.mock("../../../utils/modelUnitPricing", () => ({
  getModelUnitPrice: (model: unknown, params: PriceParams) =>
    mockPrice(model, params)
}));
const mockSelectShot = jest.fn();
const mockAddShot = jest.fn();
const mockInsertShot = jest.fn();
const mockMoveShot = jest.fn();
const mockSetSetup = jest.fn();
const mockSetStylePreset = jest.fn();
jest.mock("../../../stores/storyboard/StoryboardStore", () => ({
  useBoard: () => ({
    title: "My film",
    brief: "A brief",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    setupStage: "done",
    genre: mockGenre,
    directorModel: { id: "model-1" },
    imageModel: boardModels.imageModel,
    videoModel: boardModels.videoModel,
    screenplay:
      mockScenes.length > 0
        ? { type: "screenplay", shots: mockShots, scenes: mockScenes }
        : null,
    shots: mockShots,
    activeShotId: activeShot
  }),
  useStoryboardStore: <T,>(
    selector: (s: {
      // The toolbar's render estimates read the board's two models straight
      // off the store, so the mocked state carries the slice they select.
      boards: Record<string, unknown>;
      setTitle: jest.Mock;
      setBrief: jest.Mock;
      setStyle: jest.Mock;
      setAspectRatio: jest.Mock;
      setDirectorModel: jest.Mock;
      setImageModel: jest.Mock;
      setVideoModel: jest.Mock;
      undo: jest.Mock;
      redo: jest.Mock;
      selectShot: jest.Mock;
      addShot: jest.Mock;
      insertShot: jest.Mock;
      moveShot: jest.Mock;
      setSetup: jest.Mock;
      setStylePreset: jest.Mock;
    }) => T
  ) =>
    selector({
      boards: { "board-1": boardModels },
      setTitle: jest.fn(),
      setBrief: jest.fn(),
      setStyle: jest.fn(),
      setAspectRatio: jest.fn(),
      setDirectorModel: jest.fn(),
      setImageModel: jest.fn(),
      setVideoModel: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
      selectShot: mockSelectShot,
      addShot: mockAddShot,
      insertShot: mockInsertShot,
      moveShot: mockMoveShot,
      setSetup: mockSetSetup,
      setStylePreset: mockSetStylePreset
    }),
  useStoryboardCanUndo: () => false,
  useStoryboardCanRedo: () => false
}));

// A clip's price moves with its shot's effective duration, which comes from
// the linked script's takes — so the toolbar's estimate reads the script the
// board links to. This suite mounts no query client.
jest.mock("../../../trpc/client", () => ({
  trpc: {
    scripts: {
      get: { useQuery: () => ({ data: undefined }) }
    }
  },
  trpcClient: {}
}));

// The script-link control reads the real store and a trpc query; it has its
// own suite (ScriptLinkControl.test.tsx).
jest.mock("../ScriptLinkControl", () => ({
  __esModule: true,
  default: () => null
}));

const mockGenerateKeyframe = jest.fn(async () => undefined);
const mockGenerateClip = jest.fn(async () => undefined);
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: mockGenerateKeyframe,
    generateClip: mockGenerateClip
  })
}));

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: [] })
}));

// The toolbar's summary line names the board's entities, and the style dialog
// reads their descriptors; the library itself resolves through React Query,
// which these tests do not mount.
let mockEntities: Entity[] = [];
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));

// The shipped style presets are a server query; the dialog only needs the
// tiles and the entity id each one applies.
let mockPresets: Array<{
  entityId: string;
  presetId: string;
  name: string;
  descriptor: string;
  thumbnail: string;
}> = [];
jest.mock("../../../serverState/useStylePresets", () => ({
  useStylePresets: () => ({ data: mockPresets })
}));

const stub = (name: string) => ({
  __esModule: true,
  default: () => <div data-testid={name} />
});
jest.mock("../../properties/LanguageModelSelect", () => stub("lang-model"));
jest.mock("../../properties/ImageModelSelect", () => stub("image-model"));
jest.mock("../../properties/VideoModelSelect", () => stub("video-model"));
// The card's own behaviour has its own suite (ShotCard.test.tsx); this stub
// keeps the contract the board drives — the shot id hook the keyboard
// navigation focuses, selection on click, and the drag callbacks.
const mockIsVersionStale = isVersionStale;
jest.mock("../ShotCard", () => ({
  __esModule: true,
  default: ({
    shot,
    caption,
    selected,
    onSelect,
    draggable,
    dropTarget,
    onDragStart,
    onDragEnter,
    onDrop,
    renderContext
  }: {
    shot: Shot;
    caption?: string;
    renderContext?: import("@nodetool-ai/protocol").BoardRenderContext | null;
    selected?: boolean;
    onSelect?: (id: string) => void;
    draggable?: boolean;
    dropTarget?: boolean;
    onDragStart?: (id: string) => void;
    onDragEnter?: (id: string) => void;
    onDrop?: (id: string) => void;
  }) => (
    <div
      data-testid="shot-card"
      data-shot-id={shot.id}
      data-caption={caption}
      // The board owns deriving this and handing it to every card; without it
      // a stale still shows no marker and nothing else would notice.
      data-stale={
        renderContext &&
        // `mock`-prefixed so the hoisted factory may close over it; the
        // factory only runs once the imports have evaluated.
        mockIsVersionStale(shot.keyframe, shot, renderContext)
          ? "true"
          : undefined
      }
      data-draggable={draggable ? "true" : undefined}
      data-drop-target={dropTarget ? "true" : undefined}
      role="button"
      tabIndex={0}
      aria-pressed={!!selected}
      aria-label={shot.id}
      onClick={() => onSelect?.(shot.id)}
      onDragStart={() => onDragStart?.(shot.id)}
      onDragEnter={() => onDragEnter?.(shot.id)}
      onDrop={() => onDrop?.(shot.id)}
    />
  )
}));
// The inspector reads the real store, the entity library and the linked
// script; it has its own suite (ShotInspector.test.tsx).
jest.mock("../ShotInspector", () => stub("shot-inspector"));
// The real preview mounts the timeline compositor — not viable under jsdom.
jest.mock("../StoryboardPreview", () => stub("storyboard-preview"));
jest.mock("../StoryboardEntitiesField", () => stub("entities"));

const mockExportStoryboardZip = jest.fn(
  async (_boardId: string, _name: string) => undefined
);
jest.mock("../../../utils/storyboardZip", () => ({
  exportStoryboardZip: (boardId: string, name: string) =>
    mockExportStoryboardZip(boardId, name)
}));

import StoryboardBoard from "../StoryboardBoard";
import { StudioProvider } from "../../../studio/StudioContext";
import { displayNumber } from "../../../lib/storyboard/sceneOrder";

let nextIndex = 0;
const makeShot = (id: string, sceneId?: string): Shot => {
  const shot: Shot = {
    type: "shot",
    id,
    index: nextIndex++,
    slug: "Shot",
    action: "",
    status: "planned"
  };
  // No `scene_id` at all is the legacy shape the implicit header covers.
  if (sceneId) {
    shot.scene_id = sceneId;
  }
  return shot;
};

beforeEach(() => {
  nextIndex = 0;
  mockScenes = [];
  mockGenre = "";
  mockEntities = [];
  mockPresets = [];
});

const renderBoard = (onDirect: (n: number) => void) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardBoard boardId="board-1" onDirect={onDirect} />
    </ThemeProvider>
  );

const renderBoardInStudio = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StudioProvider>
        <StoryboardBoard boardId="board-1" onDirect={jest.fn()} />
      </StudioProvider>
    </ThemeProvider>
  );

// The board derives one `BoardRenderContext` and hands it to every card. It is
// what turns a version's stored render record into a stale marker, and removing
// the prop is silent everywhere else — the pill just stops appearing.
describe("stale marker plumbing", () => {
  it("hands each card a context that marks a version rendered under an old style", () => {
    const stale = makeShot("s-stale");
    stale.keyframe = {
      type: "image",
      asset_id: "old-still",
      render_inputs: {
        kind: "keyframe",
        prompt_hash: "a-hash-from-another-style",
        model: "old/model",
        aspect_ratio: "1:1",
        style_entity_id: "style-gone",
        recorded_at: "2026-01-01T00:00:00.000Z"
      }
    };
    mockShots = [stale];

    renderBoard(jest.fn());

    const card = screen.getAllByTestId("shot-card")[0];
    expect(card).toHaveAttribute("data-stale", "true");
  });
});

describe("StoryboardBoard direct guard", () => {
  it("directs immediately when the board has no shots", async () => {
    mockShots = [];
    const onDirect = jest.fn();
    const user = userEvent.setup();
    renderBoard(onDirect);

    await user.click(screen.getByRole("button", { name: "Direct" }));

    expect(onDirect).toHaveBeenCalledTimes(1);
  });

  it("confirms before re-directing over existing shots", async () => {
    mockShots = [makeShot("s1"), makeShot("s2")];
    const onDirect = jest.fn();
    const user = userEvent.setup();
    renderBoard(onDirect);

    // With shots on the board the form is folded behind the toolbar.
    await user.click(screen.getByRole("button", { name: /Board settings/ }));
    // The button relabels once shots exist.
    await user.click(screen.getByRole("button", { name: "Re-direct" }));

    // The run is held until the confirmation is accepted.
    expect(onDirect).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Re-direct this storyboard?")
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Re-direct" }));

    expect(onDirect).toHaveBeenCalledTimes(1);
  });
});

describe("StoryboardBoard preview", () => {
  it("stays disabled until a shot has a still or a clip", () => {
    mockShots = [makeShot("s1")];
    renderBoard(jest.fn());

    expect(screen.getByRole("button", { name: "Preview" })).toBeDisabled();
  });

  it("toggles the preview panel", async () => {
    mockShots = [
      {
        ...makeShot("s1"),
        keyframe: { type: "image", asset_id: "still-1", uri: "asset://s1" }
      }
    ];
    const user = userEvent.setup();
    renderBoard(jest.fn());

    expect(screen.queryByTestId("storyboard-preview")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByTestId("storyboard-preview")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByTestId("storyboard-preview")).not.toBeInTheDocument();
  });
});

describe("StoryboardBoard model fields", () => {
  it("offers still and clip models but no screenplay model in Studio", () => {
    mockShots = [];
    renderBoardInStudio();

    expect(screen.getByTestId("image-model")).toBeInTheDocument();
    expect(screen.getByTestId("video-model")).toBeInTheDocument();
    expect(screen.queryByTestId("lang-model")).not.toBeInTheDocument();
  });

  it("keeps the screenplay model in the workspace editor", () => {
    mockShots = [];
    renderBoard(jest.fn());

    expect(screen.getByTestId("lang-model")).toBeInTheDocument();
  });
});

describe("StoryboardBoard download", () => {
  it("stays disabled with no shots to pack", () => {
    mockShots = [];
    renderBoard(jest.fn());

    expect(screen.getByRole("button", { name: "Download ZIP" })).toBeDisabled();
  });

  it("downloads the board archive by id", async () => {
    mockShots = [makeShot("s1")];
    mockExportStoryboardZip.mockClear();
    const user = userEvent.setup();
    renderBoard(jest.fn());

    await user.click(screen.getByRole("button", { name: "Download ZIP" }));

    expect(mockExportStoryboardZip).toHaveBeenCalledWith("board-1", "My film");
  });
});

describe("StoryboardBoard toolbar", () => {
  it("summarises the board and folds the form away once it has shots", async () => {
    mockShots = [makeShot("s1"), makeShot("s2")];
    const user = userEvent.setup();
    renderBoard(jest.fn());

    expect(screen.getByText("My film")).toBeInTheDocument();
    expect(screen.getByText("2 shots")).toBeInTheDocument();
    // Folded: the screenplay fields are out of the DOM until asked for.
    expect(screen.queryByTestId("lang-model")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Board settings/ }));
    expect(await screen.findByTestId("lang-model")).toBeInTheDocument();
  });

  it("keeps the form open while the board has no shots", () => {
    mockShots = [];
    renderBoard(jest.fn());

    expect(screen.getByTestId("lang-model")).toBeInTheDocument();
    expect(screen.getByText("0 shots")).toBeInTheDocument();
  });

  it("renders the render actions on the toolbar", () => {
    mockShots = [makeShot("s1")];
    renderBoard(jest.fn());

    expect(
      screen.getByRole("button", { name: "Render stills (1)" })
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Render clips" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Assemble timeline" })
    ).toBeDisabled();
  });

  it("puts each batch's price on its own button", () => {
    // Two shots await a still; only the one already holding a keyframe can be
    // animated, so the two buttons quote different batches.
    mockShots = [
      makeShot("s1"),
      makeShot("s2"),
      {
        ...makeShot("s3"),
        status: "keyframe_ready",
        keyframe: { type: "image", asset_id: "asset-1" },
        duration_seconds: 4
      }
    ];
    boardModels = {
      imageModel: { id: "fal-ai/flux/schnell", provider: "fal_ai" },
      videoModel: { id: "pixverse/720p", provider: "fal_ai" }
    };
    mockPrice.mockImplementation((_model, params) => ({
      unit_price: params.resolution === "1K" ? 0.01 : 0.5,
      billing_unit: "images",
      currency: "USD",
      source: "bundle"
    }));

    renderBoard(jest.fn());

    // The figure is the batch, not one shot — and each button quotes its own.
    expect(
      screen.getByRole("button", { name: "Render stills (2) · ~$0.02" })
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Render clips (1) · ~$0.5" })
    ).toBeEnabled();

    boardModels = { imageModel: null, videoModel: null };
    mockPrice.mockReset();
    mockPrice.mockReturnValue(null);
  });
});

describe("StoryboardBoard add shot", () => {
  it("appends a shot through the store", async () => {
    mockShots = [makeShot("s1")];
    mockAddShot.mockClear();
    renderBoard(jest.fn());
    await userEvent.click(screen.getByRole("button", { name: "Add shot" }));
    expect(mockAddShot).toHaveBeenCalledWith("board-1");
  });

  it("is hidden on a read-only board", () => {
    mockShots = [makeShot("s1")];
    render(
      <ThemeProvider theme={mockTheme}>
        <StoryboardBoard boardId="board-1" readOnly />
      </ThemeProvider>
    );
    expect(
      screen.queryByRole("button", { name: "Add shot" })
    ).not.toBeInTheDocument();
  });
});

describe("StoryboardBoard keyboard navigation", () => {
  beforeEach(() => {
    mockShots = [makeShot("s1"), makeShot("s2"), makeShot("s3")];
    mockSelectShot.mockClear();
  });
  afterEach(() => {
    activeShot = null;
  });

  it("moves the selection to the next shot and focuses its card", () => {
    activeShot = "s1";
    renderBoard(jest.fn());
    const grid = screen.getByRole("group", { name: "Shots" });
    screen.getByRole("button", { name: "s1" }).focus();

    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(mockSelectShot).toHaveBeenCalledWith("board-1", "s2");
    expect(screen.getByRole("button", { name: "s2" })).toHaveFocus();
  });

  it("stops at the last shot rather than wrapping", () => {
    activeShot = "s3";
    renderBoard(jest.fn());
    fireEvent.keyDown(screen.getByRole("group", { name: "Shots" }), {
      key: "ArrowRight"
    });
    expect(mockSelectShot).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "s3" })).toHaveFocus();
  });

  it("jumps to the ends with Home and End", () => {
    activeShot = "s2";
    renderBoard(jest.fn());
    const grid = screen.getByRole("group", { name: "Shots" });
    fireEvent.keyDown(grid, { key: "End" });
    expect(mockSelectShot).toHaveBeenLastCalledWith("board-1", "s3");
    fireEvent.keyDown(grid, { key: "Home" });
    expect(mockSelectShot).toHaveBeenLastCalledWith("board-1", "s1");
  });

  it("clears the selection on Escape", () => {
    activeShot = "s2";
    renderBoard(jest.fn());
    fireEvent.keyDown(screen.getByRole("group", { name: "Shots" }), {
      key: "Escape"
    });
    expect(mockSelectShot).toHaveBeenCalledWith("board-1", null);
  });
});

describe("StoryboardBoard drag to reorder", () => {
  beforeEach(() => {
    mockShots = [makeShot("s1"), makeShot("s2"), makeShot("s3")];
    mockMoveShot.mockClear();
  });

  it("drops the dragged shot into the target's slot", () => {
    renderBoard(jest.fn());
    const first = screen.getByRole("button", { name: "s1" });
    const third = screen.getByRole("button", { name: "s3" });
    expect(first).toHaveAttribute("data-draggable", "true");

    fireEvent.dragStart(first);
    fireEvent.dragEnter(third);
    expect(third).toHaveAttribute("data-drop-target", "true");
    fireEvent.drop(third);

    // A legacy board is one implicit scene, so the move names it as null and
    // the store reindexes; the board never writes an order itself.
    expect(mockMoveShot).toHaveBeenCalledWith("board-1", "s1", null, 2);
    expect(third).not.toHaveAttribute("data-drop-target");
  });

  it("ignores a drop on the dragged card itself", () => {
    renderBoard(jest.fn());
    const first = screen.getByRole("button", { name: "s1" });
    fireEvent.dragStart(first);
    fireEvent.dragEnter(first);
    expect(first).not.toHaveAttribute("data-drop-target");
    fireEvent.drop(first);
    expect(mockMoveShot).not.toHaveBeenCalled();
  });

  it("names the target scene when the drop crosses a header", () => {
    // Two scenes, two shots each. Dragging the first card of scene A onto the
    // first card of scene B is a scene change, not a reorder (criterion 9).
    mockScenes = [
      { type: "scene", id: "sc-a", slugline: "INT. FLAT — DAY" },
      { type: "scene", id: "sc-b", slugline: "EXT. STREET — NIGHT" }
    ];
    mockShots = [
      makeShot("a1", "sc-a"),
      makeShot("a2", "sc-a"),
      makeShot("b1", "sc-b"),
      makeShot("b2", "sc-b")
    ];
    renderBoard(jest.fn());

    fireEvent.dragStart(screen.getByRole("button", { name: "a1" }));
    fireEvent.drop(screen.getByRole("button", { name: "b1" }));

    expect(mockMoveShot).toHaveBeenCalledWith("board-1", "a1", "sc-b", 1);
  });

  it("does not make cards draggable on a read-only board", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <StoryboardBoard boardId="board-1" readOnly />
      </ThemeProvider>
    );
    expect(screen.getByRole("button", { name: "s1" })).not.toHaveAttribute(
      "data-draggable"
    );
  });
});

describe("StoryboardBoard scene headers", () => {
  it("gives a legacy board one implicit header and no slugline", () => {
    mockShots = [makeShot("s1"), makeShot("s2")];
    renderBoard(jest.fn());

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Scene 1");
    expect(
      screen.queryByText(/INT\.|EXT\./)
    ).not.toBeInTheDocument();
  });

  it("groups the cards under one header per scene, in derived order", () => {
    mockScenes = [
      { type: "scene", id: "sc-a", slugline: "INT. FLAT — DAY" },
      { type: "scene", id: "sc-b", slugline: "EXT. STREET — NIGHT" }
    ];
    mockShots = [
      makeShot("a1", "sc-a"),
      makeShot("b1", "sc-b"),
      makeShot("b2", "sc-b")
    ];
    renderBoard(jest.fn());

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)
    ).toEqual(["Scene 1", "Scene 2"]);
    expect(screen.getByText("INT. FLAT — DAY")).toBeInTheDocument();
    expect(screen.getByText("EXT. STREET — NIGHT")).toBeInTheDocument();
  });

  it("captions every card with the derived Scene N | Shot N", () => {
    mockScenes = [
      { type: "scene", id: "sc-a", slugline: "INT. FLAT — DAY" },
      { type: "scene", id: "sc-b", slugline: "EXT. STREET — NIGHT" }
    ];
    mockShots = [
      makeShot("a1", "sc-a"),
      makeShot("b1", "sc-b"),
      makeShot("b2", "sc-b")
    ];
    renderBoard(jest.fn());

    // The board builds these in one pass; `displayNumber` is the definition.
    for (const shot of mockShots) {
      const { scene, shot: n } = displayNumber(shot, mockShots);
      expect(screen.getByRole("button", { name: shot.id })).toHaveAttribute(
        "data-caption",
        `Scene ${scene} | Shot ${n}`
      );
    }
  });
});

describe("StoryboardBoard insert point", () => {
  it("inserts after the card it follows", async () => {
    mockShots = [makeShot("s1"), makeShot("s2")];
    mockInsertShot.mockClear();
    const user = userEvent.setup();
    renderBoard(jest.fn());

    await user.click(
      screen.getByRole("button", { name: "Insert a shot after Scene 1 | Shot 1" })
    );

    expect(mockInsertShot).toHaveBeenCalledWith("board-1", "s1");
  });

  it("is absent on a read-only board", () => {
    mockShots = [makeShot("s1")];
    render(
      <ThemeProvider theme={mockTheme}>
        <StoryboardBoard boardId="board-1" readOnly />
      </ThemeProvider>
    );

    expect(
      screen.queryByRole("button", { name: /^Insert a shot/ })
    ).not.toBeInTheDocument();
  });
});

describe("StoryboardBoard genre chip", () => {
  it("writes the picked genre to the board", async () => {
    mockShots = [makeShot("s1")];
    mockSetSetup.mockClear();
    const user = userEvent.setup();
    renderBoard(jest.fn());

    await user.click(screen.getByRole("button", { name: "Set genre" }));
    const grid = await screen.findByRole("group", { name: "Genre" });
    await user.click(within(grid).getByRole("button", { name: /Thriller/ }));

    expect(mockSetSetup).toHaveBeenCalledWith("board-1", { genre: "Thriller" });
  });

  it("shows the stored genre on the chip", () => {
    mockShots = [makeShot("s1")];
    mockGenre = "Noir";
    renderBoard(jest.fn());

    expect(screen.getByRole("button", { name: "Noir" })).toBeInTheDocument();
  });
});

describe("StoryboardBoard Change Style", () => {
  it("applies the preset and renders nothing (D12)", async () => {
    mockShots = [makeShot("s1")];
    mockEntities = [
      {
        type: "entity",
        id: "ent-noir",
        kind: "style",
        name: "Noir",
        descriptor: "high contrast black and white"
      }
    ];
    mockPresets = [
      {
        entityId: "ent-noir",
        presetId: "noir",
        name: "Noir",
        descriptor: "high contrast black and white",
        thumbnail: "package://nodetool-base/styles/noir.jpg"
      }
    ];
    mockSetStylePreset.mockClear();
    mockGenerateKeyframe.mockClear();
    mockGenerateClip.mockClear();
    const user = userEvent.setup();
    renderBoard(jest.fn());

    await user.click(screen.getByRole("button", { name: "Change Style" }));
    const grid = await screen.findByRole("group", { name: "Art style" });
    await user.click(within(grid).getByRole("button", { name: /Noir/ }));

    expect(mockSetStylePreset).toHaveBeenCalledWith(
      "board-1",
      "ent-noir",
      mockEntities
    );
    // D12: a style change marks stale. It never enqueues a render.
    expect(mockGenerateKeyframe).not.toHaveBeenCalled();
    expect(mockGenerateClip).not.toHaveBeenCalled();
  });
});

describe("StoryboardBoard next steps", () => {
  it("offers Assemble timeline once a shot has a clip", () => {
    mockShots = [
      {
        ...makeShot("s1"),
        status: "rendered",
        clip: { type: "video", asset_id: "clip-1" }
      }
    ];
    const onAssemble = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <StoryboardBoard boardId="board-1" onAssemble={onAssemble} />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("button", { name: "Assemble timeline" })
    ).toBeEnabled();
  });
});

describe("StoryboardBoard selection", () => {
  it("opens the inspector for the selected shot", () => {
    mockShots = [makeShot("s1")];
    renderBoard(jest.fn());
    expect(screen.queryByTestId("shot-inspector")).not.toBeInTheDocument();

    activeShot = "s1";
    renderBoard(jest.fn());
    expect(screen.getAllByTestId("shot-inspector").length).toBeGreaterThan(0);
    activeShot = null;
  });
});
