import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
    send: jest.fn().mockResolvedValue(undefined)
  }
}));

import StoryboardQueueOverlay from "../StoryboardQueueOverlay";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";

const BOARD = "qo-board";

const seedShot = (id: string, index: number, slug: string): void => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, {
    type: "shot",
    id,
    index,
    slug,
    action: "test action",
    status: "planned"
  } as never);
};

const renderOverlay = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardQueueOverlay boardId={BOARD} />
    </ThemeProvider>
  );

describe("StoryboardQueueOverlay", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    jest.clearAllMocks();
    useStoryboardGenerationStore.setState({
      shotJobs: {},
      jobToShot: {},
      generatingShotIds: [],
      failedShotIds: []
    });
  });

  it("renders nothing when the board has no active renders", () => {
    seedShot("s-idle", 0, "Opening");
    const { container } = renderOverlay();
    expect(container).toBeEmptyDOMElement();
  });

  it("collapsed: summarizes a single rendering shot with its kind", () => {
    seedShot("s1", 0, "Opening");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s1", BOARD, "req-1", "keyframe");

    renderOverlay();
    expect(screen.getByText("1. Opening")).toBeInTheDocument();
    expect(screen.getByText("Still")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand render queue/i })
    ).toBeInTheDocument();
  });

  it("expands into a card per in-flight render", async () => {
    seedShot("s1", 0, "Opening");
    seedShot("s2", 1, "Chase");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "req-1", "keyframe");
    gen.registerJob("s2", BOARD, "req-2", "clip");

    renderOverlay();
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );

    expect(screen.getByText("1. Opening")).toBeInTheDocument();
    expect(screen.getByText("2. Chase")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /cancel render/i })).toHaveLength(2);
  });

  it("cancels one render and settles the shot", async () => {
    seedShot("s1", 0, "Opening");
    const store = useStoryboardStore.getState();
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s2",
      index: 1,
      slug: "Chase",
      action: "test action",
      status: "keyframe_ready",
      keyframe: { type: "image", uri: "asset://still" }
    } as never);
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "req-1", "keyframe");
    gen.registerJob("s2", BOARD, "req-2", "clip");

    renderOverlay();
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    const cancels = screen.getAllByRole("button", { name: /cancel render/i });
    await user.click(cancels[1]);

    await waitFor(() =>
      expect(
        useStoryboardGenerationStore.getState().shotJobs["s2"]
      ).toBeUndefined()
    );
    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s2");
    expect(shot?.status).toBe("keyframe_ready");
  });

  it("cancels every in-flight render via Cancel all", async () => {
    seedShot("s1", 0, "Opening");
    seedShot("s2", 1, "Chase");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "req-1", "keyframe");
    gen.registerJob("s2", BOARD, "req-2", "clip");

    renderOverlay();
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    await user.click(
      screen.getByRole("button", { name: /cancel all renders/i })
    );

    await waitFor(() =>
      expect(
        Object.keys(useStoryboardGenerationStore.getState().shotJobs)
      ).toHaveLength(0)
    );
  });
});
