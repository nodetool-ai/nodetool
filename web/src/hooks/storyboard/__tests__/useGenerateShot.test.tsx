/**
 * @jest-environment jsdom
 *
 * Regression test: concurrent shot-generation starts are single-flight — the
 * pre-registration async window must not admit a second paid job.
 */
import { renderHook, act } from "@testing-library/react";

const run = jest.fn();
jest.mock("../../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: () => ({ getState: () => ({ run }) })
}));
jest.mock("../../../stores/storyboard/StoryboardGenerationStore", () => {
  const actual = jest.requireActual(
    "../../../stores/storyboard/StoryboardGenerationStore"
  );
  return { ...actual, subscribeShotJob: jest.fn().mockResolvedValue(undefined) };
});
// The hook resolves board entities through React Query; an empty library
// keeps these single-flight tests hermetic.
jest.mock("../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: [] })
}));
// Model catalog lookup (still-model image_to_image support) is irrelevant to
// the single-flight behavior under test.
jest.mock("../../useModelsByProvider", () => ({
  useImageModelsByProvider: () => ({ models: [] })
}));
// The clip render reads the linked script to time the shot; this stands in for
// the tRPC round trip.
const scriptQuery = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpc: {},
  trpcClient: { scripts: { get: { query: (input: { id: string }) => scriptQuery(input) } } }
}));

import { useGenerateShot, __resetStartingShotsForTests } from "../useGenerateShot";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useStoryboardGenerationStore } from "../../../stores/storyboard/StoryboardGenerationStore";
import type { Shot } from "@nodetool-ai/protocol";

const BOARD = "board-sf";
const shot: Shot = {
  type: "shot",
  id: "shot-sf",
  index: 0,
  action: "a lighthouse",
  status: "planned"
};

beforeEach(() => {
  run.mockReset();
  __resetStartingShotsForTests();
  useStoryboardGenerationStore.getState().clear(shot.id);
  useStoryboardStore.getState().ensureBoard(BOARD);
  useStoryboardStore.getState().upsertShot(BOARD, shot);
});

it("starts exactly one job for concurrent generateKeyframe calls", async () => {
  let release: (v: string) => void = () => {};
  run.mockImplementation(
    () => new Promise<string>((resolve) => (release = resolve))
  );

  const { result } = renderHook(() => useGenerateShot());
  await act(async () => {
    const first = result.current.generateKeyframe(BOARD, shot);
    const second = result.current.generateKeyframe(BOARD, shot);
    // Second call must return without starting a run while the first is in
    // its pre-registration window.
    await second;
    expect(run).toHaveBeenCalledTimes(1);
    release("job-1");
    await first;
  });
  expect(run).toHaveBeenCalledTimes(1);
});

it("allows a new start after the previous one settles", async () => {
  run.mockResolvedValue("job-1");
  const { result } = renderHook(() => useGenerateShot());
  await act(async () => {
    await result.current.generateKeyframe(BOARD, shot);
  });
  // The first job is now registered as queued — still busy, so a re-run is
  // refused until the job settles.
  expect(run).toHaveBeenCalledTimes(1);
  await act(async () => {
    await result.current.generateKeyframe(BOARD, shot);
  });
  expect(run).toHaveBeenCalledTimes(1);
});

describe("clip length on a script-linked board", () => {
  // A fresh board per test: `ensureBoard` keeps whatever screenplay a previous
  // test put on the id.
  let boardSeq = 0;
  let LINKED = "";
  const linkedShot: Shot = {
    type: "shot",
    id: "shot-linked",
    index: 0,
    action: "a lighthouse",
    status: "keyframe_ready",
    keyframe: { type: "image", uri: "http://example.com/still.png" },
    duration_seconds: 8,
    script_line_ids: ["line-1"]
  };

  /** A script whose one line has a 3.4 s take plus 250 ms of silence. */
  const script = (voiced: boolean) => ({
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
              currentTakeId: voiced ? "take-1" : null,
              takes: voiced
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
  });

  /** The `duration` the ImageToVideo node was given. */
  const renderedDuration = async (shotToRender: Shot): Promise<unknown> => {
    const { result } = renderHook(() => useGenerateShot());
    await act(async () => {
      await result.current.generateClip(LINKED, shotToRender);
    });
    const nodes = run.mock.calls[0][2] as Array<{
      id: string;
      data: { properties: Record<string, unknown> };
    }>;
    return nodes.find((n) => n.id === "gen")?.data.properties["duration"];
  };

  const seedBoard = (scriptId: string | null): void => {
    boardSeq += 1;
    LINKED = `board-linked-${boardSeq}`;
    useStoryboardStore.getState().ensureBoard(LINKED);
    if (scriptId) {
      useStoryboardStore.getState().setScreenplay(LINKED, {
        type: "screenplay",
        id: "sp-1",
        title: "Film",
        script_id: scriptId,
        shots: []
      });
    }
    useStoryboardStore.getState().upsertShot(LINKED, linkedShot);
  };

  beforeEach(() => {
    run.mockReset();
    run.mockResolvedValue("job-clip");
    scriptQuery.mockReset();
    __resetStartingShotsForTests();
    useStoryboardGenerationStore.getState().clear(linkedShot.id);
  });

  it("renders a linked shot as long as the takes it covers", async () => {
    seedBoard("script-1");
    scriptQuery.mockResolvedValue(script(true));
    // 3400 ms + 250 ms of silence, rounded up to whole seconds.
    expect(await renderedDuration(linkedShot)).toBe(4);
    expect(scriptQuery).toHaveBeenCalledWith({ id: "script-1" });
  });

  it("keeps the shot's own length when it is pinned to manual", async () => {
    seedBoard("script-1");
    scriptQuery.mockResolvedValue(script(true));
    expect(
      await renderedDuration({ ...linkedShot, duration_source: "manual" })
    ).toBe(8);
    expect(scriptQuery).not.toHaveBeenCalled();
  });

  it("keeps the shot's own length when the linked line is unvoiced", async () => {
    seedBoard("script-1");
    scriptQuery.mockResolvedValue(script(false));
    expect(await renderedDuration(linkedShot)).toBe(8);
  });

  it("leaves an unlinked board's shots alone", async () => {
    seedBoard(null);
    expect(await renderedDuration(linkedShot)).toBe(8);
    expect(scriptQuery).not.toHaveBeenCalled();
  });
});

describe("a start that fails", () => {
  it("records the reason on the shot and rethrows", async () => {
    run.mockRejectedValue(new Error("No image model configured"));
    const { result } = renderHook(() => useGenerateShot());

    await act(async () => {
      await expect(result.current.generateKeyframe(BOARD, shot)).rejects.toThrow(
        "No image model configured"
      );
    });

    const job = useStoryboardGenerationStore.getState().shotJobs[shot.id];
    expect(job?.status).toBe("failed");
    expect(job?.errorMessage).toBe("No image model configured");
    expect(
      useStoryboardStore.getState().getBoard(BOARD)?.shots[0].status
    ).toBe("failed");
  });

  it("records a reason when the runner returns no job id", async () => {
    run.mockResolvedValue(undefined);
    const { result } = renderHook(() => useGenerateShot());

    await act(async () => {
      await expect(
        result.current.generateKeyframe(BOARD, shot)
      ).rejects.toThrow("Workflow runner did not return a job id");
    });

    expect(
      useStoryboardGenerationStore.getState().shotJobs[shot.id]?.errorMessage
    ).toBe("Workflow runner did not return a job id");
  });
});
