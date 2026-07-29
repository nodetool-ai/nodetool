import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(() => {}),
    send: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock("../../../trpc/client", () => ({
  trpcClient: { jobs: { cancel: { mutate: jest.fn().mockResolvedValue({}) } } }
}));

import StoryboardQueueOverlay from "../StoryboardQueueOverlay";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";
import { trpcClient } from "../../../trpc/client";

const mockCancel = trpcClient.jobs.cancel.mutate as jest.Mock;

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
  beforeEach(() => {
    jest.clearAllMocks();
    useStoryboardGenerationStore.setState({
      shotJobs: {},
      jobToShot: {},
      generatingShotIds: [],
      failedShotIds: []
    });
  });

  it("renders nothing when the board has no active jobs", () => {
    seedShot("s-idle", 0, "Opening");
    const { container } = renderOverlay();
    expect(container).toBeEmptyDOMElement();
  });

  it("collapsed: summarizes a single rendering shot with its kind", () => {
    seedShot("s1", 0, "Opening");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "job-1", "wf-1", "keyframe");
    gen.updateJobStatus("job-1", "running");

    renderOverlay();
    expect(screen.getByText("1. Opening")).toBeInTheDocument();
    expect(screen.getByText("Still")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /expand render queue/i })
    ).toBeInTheDocument();
  });

  it("expands into Rendering and Enqueued sections", () => {
    seedShot("s1", 0, "Opening");
    seedShot("s2", 1, "Chase");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "job-1", "wf-1", "keyframe");
    gen.updateJobStatus("job-1", "running");
    gen.registerJob("s2", BOARD, "job-2", "wf-2", "clip");

    renderOverlay();
    fireEvent.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );

    expect(screen.getByText("Rendering")).toBeInTheDocument();
    expect(screen.getByText("Enqueued")).toBeInTheDocument();
    expect(screen.getByText("1. Opening")).toBeInTheDocument();
    expect(screen.getByText("2. Chase")).toBeInTheDocument();
  });

  it("cancels a queued job and settles the shot", async () => {
    seedShot("s1", 0, "Opening");
    seedShot("s2", 1, "Chase");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "job-1", "wf-1", "keyframe");
    gen.updateJobStatus("job-1", "running");
    gen.registerJob("s2", BOARD, "job-2", "wf-2", "clip");

    renderOverlay();
    fireEvent.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /remove from queue/i }));

    await waitFor(() =>
      expect(mockCancel).toHaveBeenCalledWith({ id: "job-2" })
    );
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

  it("cancels every active job via Cancel all", async () => {
    seedShot("s1", 0, "Opening");
    seedShot("s2", 1, "Chase");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "job-1", "wf-1", "keyframe");
    gen.updateJobStatus("job-1", "running");
    gen.registerJob("s2", BOARD, "job-2", "wf-2", "clip");

    renderOverlay();
    fireEvent.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    fireEvent.click(
      screen.getByRole("button", { name: /cancel all renders/i })
    );

    await waitFor(() => expect(mockCancel).toHaveBeenCalledTimes(2));
    expect(mockCancel).toHaveBeenCalledWith({ id: "job-1" });
    expect(mockCancel).toHaveBeenCalledWith({ id: "job-2" });
  });

  it("keeps tracking a job when the cancel call fails", async () => {
    seedShot("s1", 0, "Opening");
    const gen = useStoryboardGenerationStore.getState();
    gen.registerJob("s1", BOARD, "job-1", "wf-1", "keyframe");
    gen.updateJobStatus("job-1", "running");
    mockCancel.mockRejectedValueOnce(new Error("nope"));
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    renderOverlay();
    fireEvent.click(
      screen.getByRole("button", { name: /expand render queue/i })
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel render/i }));

    await waitFor(() => expect(mockCancel).toHaveBeenCalled());
    expect(
      useStoryboardGenerationStore.getState().shotJobs["s1"]?.status
    ).toBe("running");
    consoleSpy.mockRestore();
  });
});
