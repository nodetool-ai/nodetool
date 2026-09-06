/**
 * E1 criterion 18: `Retry N failed` shows only while a shot's *last* job
 * failed, and retries exactly those shots.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

const mockGenerateKeyframe = jest.fn().mockResolvedValue(undefined);
const mockGenerateClip = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: mockGenerateKeyframe,
    generateClip: mockGenerateClip,
    generateRevisedClip: jest.fn()
  })
}));

import BoardRetryFailed from "../BoardRetryFailed";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import {
  useStoryboardGenerationStore,
  type ShotJobState
} from "../../../stores/storyboard/StoryboardGenerationStore";

const BOARD = "board-retry";

const shot = (id: string, index: number): Shot => ({
  type: "shot",
  id,
  index,
  action: `shot ${index}`,
  status: "planned"
});

const job = (overrides: Partial<ShotJobState> & Pick<ShotJobState, "shotId">) =>
  ({
    boardId: BOARD,
    jobId: `req-${overrides.shotId}`,
    kind: "keyframe",
    status: "failed",
    startedAt: Date.now(),
    ...overrides
  }) satisfies ShotJobState;

const setJobs = (jobs: ShotJobState[]): void => {
  useStoryboardGenerationStore.setState({
    shotJobs: Object.fromEntries(jobs.map((j) => [j.shotId, j])),
    jobToShot: Object.fromEntries(jobs.map((j) => [j.jobId, j.shotId])),
    failedShotIds: jobs.filter((j) => j.status === "failed").map((j) => j.shotId),
    generatingShotIds: []
  });
};

const renderRetry = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <BoardRetryFailed boardId={BOARD} />
    </ThemeProvider>
  );

beforeEach(() => {
  mockGenerateKeyframe.mockClear();
  mockGenerateClip.mockClear();
  useStoryboardStore.setState({ boards: {}, history: {}, serverRevisions: {} });
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.upsertShot(BOARD, shot("s-failed-still", 0));
  store.upsertShot(BOARD, shot("s-failed-clip", 1));
  store.upsertShot(BOARD, shot("s-ok", 2));
  setJobs([]);
});

describe("BoardRetryFailed", () => {
  it("renders nothing when no shot's last job failed", () => {
    setJobs([job({ shotId: "s-ok", status: "completed" })]);

    const { container } = renderRetry();

    expect(container.firstChild).toBeNull();
  });

  it("counts only this board's failures", () => {
    setJobs([
      job({ shotId: "s-failed-still" }),
      job({ shotId: "s-elsewhere", boardId: "other-board" })
    ]);

    renderRetry();

    expect(
      screen.getByRole("button", { name: "Retry 1 failed" })
    ).toBeInTheDocument();
  });

  it("retries exactly the failed shots, each with the kind it failed on", async () => {
    setJobs([
      job({ shotId: "s-failed-still", kind: "keyframe" }),
      job({ shotId: "s-failed-clip", kind: "clip" }),
      job({ shotId: "s-ok", status: "completed" })
    ]);

    renderRetry();
    await userEvent.click(
      screen.getByRole("button", { name: "Retry 2 failed" })
    );

    expect(mockGenerateKeyframe).toHaveBeenCalledTimes(1);
    expect(mockGenerateKeyframe).toHaveBeenCalledWith(
      BOARD,
      expect.objectContaining({ id: "s-failed-still" })
    );
    expect(mockGenerateClip).toHaveBeenCalledTimes(1);
    expect(mockGenerateClip).toHaveBeenCalledWith(
      BOARD,
      expect.objectContaining({ id: "s-failed-clip" })
    );
  });

  it("drops a shot from the set once a later render succeeded", () => {
    setJobs([job({ shotId: "s-failed-still" })]);
    const { rerender } = renderRetry();
    expect(
      screen.getByRole("button", { name: "Retry 1 failed" })
    ).toBeInTheDocument();

    // A successful re-render clears the shot's row — its last job is not a
    // failure any more.
    act(() => {
      useStoryboardGenerationStore.getState().clear("s-failed-still");
    });
    rerender(
      <ThemeProvider theme={mockTheme}>
        <BoardRetryFailed boardId={BOARD} />
      </ThemeProvider>
    );

    expect(screen.queryByRole("button")).toBeNull();
  });
});
