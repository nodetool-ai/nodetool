/**
 * E1 criterion 18: `Retry N failed` shows only while a shot's *last* job
 * failed, and retries exactly those shots.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { Shot } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";

const mockRetryFailedRequest = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../hooks/storyboard/useGenerateShot", () => ({
  useGenerateShot: () => ({
    generateKeyframe: jest.fn(),
    generateClip: jest.fn(),
    generateRevisedClip: jest.fn(),
    retryFailedRequest: mockRetryFailedRequest
  })
}));

import BoardRetryFailed from "../BoardRetryFailed";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import {
  useStoryboardGenerationStore,
  type ShotJobState,
  type ShotRequestRecord
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
    generatingShotIds: [],
    requestRecords: Object.fromEntries(
      jobs.map((value) => [
        value.jobId,
        { ...value, batchId: "original-batch" } satisfies ShotRequestRecord
      ])
    )
  });
};

const renderRetry = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <BoardRetryFailed boardId={BOARD} />
    </ThemeProvider>
  );

beforeEach(() => {
  mockRetryFailedRequest.mockClear();
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

  it("retries exactly the failed requests in one recovery batch", async () => {
    setJobs([
      job({ shotId: "s-failed-still", kind: "keyframe" }),
      job({ shotId: "s-failed-clip", kind: "clip" }),
      job({ shotId: "s-ok", status: "completed" })
    ]);

    renderRetry();
    await userEvent.click(
      screen.getByRole("button", { name: "Retry 2 failed" })
    );

    expect(mockRetryFailedRequest).toHaveBeenCalledTimes(2);
    expect(mockRetryFailedRequest.mock.calls.map(([requestId]) => requestId)).toEqual([
      "req-s-failed-still",
      "req-s-failed-clip"
    ]);
    expect(mockRetryFailedRequest.mock.calls[0]?.[1]).toBe(
      mockRetryFailedRequest.mock.calls[1]?.[1]
    );
  });

  it("does not offer an already retried failed request again", () => {
    setJobs([job({ shotId: "s-failed-still" })]);
    const { rerender } = renderRetry();
    expect(
      screen.getByRole("button", { name: "Retry 1 failed" })
    ).toBeInTheDocument();

    useStoryboardGenerationStore.setState((state) => ({
      requestRecords: {
        ...state.requestRecords,
        "req-s-failed-still": {
          ...state.requestRecords["req-s-failed-still"],
          retriedAt: Date.now()
        }
      }
    }));
    rerender(
      <ThemeProvider theme={mockTheme}>
        <BoardRetryFailed boardId={BOARD} />
      </ThemeProvider>
    );

    expect(screen.queryByRole("button")).toBeNull();
  });
});
