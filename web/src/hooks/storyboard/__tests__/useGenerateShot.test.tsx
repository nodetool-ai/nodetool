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
