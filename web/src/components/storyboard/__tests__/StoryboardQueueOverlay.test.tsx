import { render, screen } from "@testing-library/react";
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

const mockRetryFailedRequest = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(),
    generateClip: jest.fn(),
    generateRevisedClip: jest.fn(),
    retryFailedRequest: mockRetryFailedRequest
  })
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

const renderOverlay = (
  onReviewCompleted?: (target: { shotId: string; requestId: string }) => void,
  readOnly = false
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardQueueOverlay
        boardId={BOARD}
        onReviewCompleted={onReviewCompleted}
        readOnly={readOnly}
      />
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
      failedShotIds: [],
      requestRecords: {},
      pendingJobs: {},
      productionJobs: {}
    });
  });

  it("renders nothing when the board has no active renders", () => {
    seedShot("s-idle", 0, "Opening");
    const { container } = renderOverlay();
    expect(container).toBeEmptyDOMElement();
  });

  it("collapsed: summarizes provider requests rather than shots", () => {
    seedShot("s1", 0, "Opening");
    useStoryboardGenerationStore
      .getState()
      .registerJob("s1", BOARD, "req-1", "keyframe");

    renderOverlay();
    expect(screen.getByText("1 request · 1 running")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand render queue/i })
    ).toBeInTheDocument();
  });

  it("expands into a card per in-flight render", async () => {
    seedShot("s1", 0, "Opening");
    seedShot("s2", 1, "Chase");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob(
      "s1",
      BOARD,
      "req-1",
      "keyframe",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "batch-active"
    );
    gen.registerJob(
      "s2",
      BOARD,
      "req-2",
      "clip",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "batch-active"
    );

    renderOverlay();
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );

    expect(screen.getByText("1. Opening")).toBeInTheDocument();
    expect(screen.getByText("2. Chase")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /stop tracking render/i })
    ).toHaveLength(2);
    expect(
      screen.getByText(/provider may still finish the request and charge/i)
    ).toBeInTheDocument();
  });

  it("stops tracking without removing the recoverable provider request", async () => {
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
    gen.registerJob(
      "s1",
      BOARD,
      "req-1",
      "keyframe",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "batch-stop"
    );
    gen.registerJob(
      "s2",
      BOARD,
      "req-2",
      "clip",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "batch-stop"
    );

    renderOverlay();
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    const stops = screen.getAllByRole("button", {
      name: /stop tracking render/i
    });
    await user.click(stops[1]);

    expect(
      useStoryboardGenerationStore.getState().requestRecords["req-2"]?.status
    ).toBe("stopped");
    expect(
      useStoryboardGenerationStore.getState().pendingJobs[BOARD]
    ).toContainEqual(expect.objectContaining({ jobId: "req-2" }));
    const shot = useStoryboardStore
      .getState()
      .getBoard(BOARD)
      ?.shots.find((s) => s.id === "s2");
    expect(shot?.status).toBe("keyframe_ready");
  });

  it("keeps an exact mixed-outcome batch receipt until dismissal", async () => {
    const gen = useStoryboardGenerationStore.getState();
    for (let index = 0; index < 6; index += 1) {
      const shotId = `receipt-${index}`;
      const requestId = `receipt-request-${index}`;
      seedShot(shotId, index, `Take ${index + 1}`);
      gen.registerJob(
        shotId,
        BOARD,
        requestId,
        "clip",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "six-request-batch"
      );
      gen.updateJobStatus(
        requestId,
        index < 4 ? "completed" : "failed",
        index < 4
          ? { assetId: `asset-${index}` }
          : { errorMessage: `failed-${index}` }
      );
    }

    renderOverlay();
    expect(screen.getByText("4 completed · 2 failed")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    expect(
      screen.getByText(
        "6 requests: 0 running, 4 completed, 2 failed, 0 awaiting review, 0 stopped."
      )
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry 2 failed" }));
    expect(
      mockRetryFailedRequest.mock.calls.map(([requestId]) => requestId)
    ).toEqual(["receipt-request-4", "receipt-request-5"]);
    await user.click(screen.getByRole("button", { name: "Dismiss receipt" }));
    expect(screen.queryByText(/6 requests:/)).not.toBeInTheDocument();
  });

  it("opens a completed candidate for review from the retained receipt", async () => {
    seedShot("s-review", 0, "Review me");
    const onReviewCompleted = jest.fn();
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob(
      "s-review",
      BOARD,
      "req-review",
      "clip",
      undefined,
      {} as never,
      undefined,
      undefined,
      undefined,
      "review-batch"
    );
    gen.updateJobStatus("req-review", "completed", {
      assetId: "candidate-asset"
    });
    useStoryboardStore.getState().upsertShot(BOARD, {
      type: "shot",
      id: "s-review",
      index: 0,
      slug: "Review me",
      action: "test action",
      status: "planned",
      clip_versions: [{ type: "video", asset_id: "candidate-asset" }]
    } as never);

    renderOverlay(onReviewCompleted);
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    await user.click(
      screen.getByRole("button", { name: "Review completed takes" })
    );

    expect(onReviewCompleted).toHaveBeenCalledWith({
      shotId: "s-review",
      requestId: "req-review"
    });
  });

  it("counts inactive still candidates but not already accepted media", async () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s-candidates",
      index: 0,
      slug: "Choices",
      action: "test action",
      status: "rendered",
      keyframe: { type: "image", asset_id: "still-current" },
      keyframe_versions: [
        { type: "image", asset_id: "still-current" },
        { type: "image", asset_id: "still-candidate" }
      ],
      clip: { type: "video", asset_id: "clip-current" },
      clip_versions: [{ type: "video", asset_id: "clip-current" }]
    } as never);
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob(
      "s-candidates",
      BOARD,
      "req-still",
      "keyframe",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "review-state"
    );
    gen.updateJobStatus("req-still", "completed", {
      assetId: "still-candidate"
    });
    gen.registerJob(
      "s-candidates",
      BOARD,
      "req-clip",
      "clip",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "review-state"
    );
    gen.updateJobStatus("req-clip", "completed", {
      assetId: "clip-current"
    });

    renderOverlay();
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );

    expect(
      screen.getByText(
        "2 requests: 0 running, 2 completed, 0 failed, 1 awaiting review, 0 stopped."
      )
    ).toBeInTheDocument();
  });

  it("opens the first unaccepted candidate rather than an accepted completion", async () => {
    const store = useStoryboardStore.getState();
    store.ensureBoard(BOARD);
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s-accepted",
      index: 0,
      slug: "Accepted",
      action: "accepted",
      status: "rendered",
      clip: { type: "video", asset_id: "clip-current" },
      clip_versions: [{ type: "video", asset_id: "clip-current" }]
    } as never);
    store.upsertShot(BOARD, {
      type: "shot",
      id: "s-unreviewed",
      index: 1,
      slug: "Unreviewed",
      action: "unreviewed",
      status: "planned",
      keyframe_versions: [{ type: "image", asset_id: "still-candidate" }]
    } as never);
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob(
      "s-accepted",
      BOARD,
      "req-accepted",
      "clip",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "review-target"
    );
    gen.updateJobStatus("req-accepted", "completed", {
      assetId: "clip-current"
    });
    gen.registerJob(
      "s-unreviewed",
      BOARD,
      "req-unreviewed",
      "keyframe",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "review-target"
    );
    gen.updateJobStatus("req-unreviewed", "completed", {
      assetId: "still-candidate"
    });
    const onReviewCompleted = jest.fn();

    renderOverlay(onReviewCompleted);
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    await user.click(
      screen.getByRole("button", { name: "Review completed takes" })
    );

    expect(onReviewCompleted).toHaveBeenCalledWith({
      shotId: "s-unreviewed",
      requestId: "req-unreviewed"
    });
  });

  it("does not expose queue mutations in view mode", async () => {
    seedShot("s-readonly", 0, "Read only");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob(
      "s-readonly",
      BOARD,
      "req-readonly",
      "clip",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "readonly-batch"
    );
    gen.updateJobStatus("req-readonly", "failed", {
      errorMessage: "failed"
    });

    renderOverlay(undefined, true);
    await user.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );

    expect(
      screen.queryByRole("button", { name: "Retry 1 failed" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Dismiss receipt" })
    ).not.toBeInTheDocument();
  });
});
