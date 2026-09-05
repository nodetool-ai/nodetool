import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

let mockShots: Shot[] = [];
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
const mockReorderShots = jest.fn();
jest.mock("../../../stores/storyboard/StoryboardStore", () => ({
  useBoard: () => ({
    title: "My film",
    brief: "A brief",
    style: "",
    entityIds: [],
    aspectRatio: "16:9",
    directorModel: { id: "model-1" },
    imageModel: boardModels.imageModel,
    videoModel: boardModels.videoModel,
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
      reorderShots: jest.Mock;
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
      reorderShots: mockReorderShots
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

jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(async () => undefined),
    generateClip: jest.fn(async () => undefined)
  })
}));

jest.mock("../../../hooks/useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: [] })
}));

// The toolbar's summary line names the board's entities; the library itself
// resolves through React Query, which these tests do not mount.
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
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
jest.mock("../ShotCard", () => ({
  __esModule: true,
  default: ({
    shot,
    selected,
    onSelect,
    draggable,
    dropTarget,
    onDragStart,
    onDragEnter,
    onDrop
  }: {
    shot: Shot;
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

const makeShot = (id: string): Shot => ({
  type: "shot",
  id,
  index: 0,
  slug: "Shot",
  action: "",
  status: "planned"
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
    mockReorderShots.mockClear();
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

    expect(mockReorderShots).toHaveBeenCalledWith("board-1", [
      "s2",
      "s3",
      "s1"
    ]);
    expect(third).not.toHaveAttribute("data-drop-target");
  });

  it("ignores a drop on the dragged card itself", () => {
    renderBoard(jest.fn());
    const first = screen.getByRole("button", { name: "s1" });
    fireEvent.dragStart(first);
    fireEvent.dragEnter(first);
    expect(first).not.toHaveAttribute("data-drop-target");
    fireEvent.drop(first);
    expect(mockReorderShots).not.toHaveBeenCalled();
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
