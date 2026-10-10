/**
 * The setup writer's saves (F1). A typed edit lands in memory at once and is
 * saved after a pause; explicit writes save at once; and saves of one
 * workflow never overlap, because two in flight carry the same
 * `expected_updated_at` and the second fails with a concurrency conflict.
 */
import { act, renderHook } from "@testing-library/react";

let settings: Record<string, unknown> = {};
let inFlight = 0;
let maxInFlight = 0;
const releases: Array<(error?: Error) => void> = [];
const saveWorkflow = jest.fn(
  (
    _workflow: { settings: Record<string, unknown> },
    _options?: { snapshot?: boolean }
  ) =>
    new Promise<void>((resolve, reject) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      releases.push((error) => {
        inFlight -= 1;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    })
);
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow: jest.fn((workflow: { settings: unknown }) => {
    settings = workflow.settings as Record<string, unknown>;
  }),
  saveWorkflow
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

const addNotification = jest.fn();
jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: { getState: () => ({ addNotification }) }
}));

import { readWorkflowSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  SETUP_EDIT_SAVE_DELAY_MS,
  useWorkflowSetupWriter
} from "../useWorkflowSetup";

/** Let queued promise callbacks run. */
const settle = () => act(async () => {});

/** Finish the oldest save on the wire. */
const finishSave = async (error?: Error) => {
  const release = releases.shift();
  if (!release) {
    throw new Error("No save is in flight.");
  }
  await act(async () => {
    release(error);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  settings = {};
  inFlight = 0;
  maxInFlight = 0;
  releases.length = 0;
});

afterEach(async () => {
  // Drain whatever a test left queued so the next one starts idle.
  while (releases.length > 0) {
    await finishSave();
  }
  jest.useRealTimers();
});

describe("useWorkflowSetupWriter", () => {
  it("saves a burst of typed edits once, after the pause", async () => {
    const { result } = renderHook(() => useWorkflowSetupWriter("w1"));
    act(() => {
      for (const brief of ["S", "Su", "Sum", "Summ"]) {
        result.current.editSetup({ brief });
      }
    });
    // The field reads what was typed before anything is saved.
    expect(readWorkflowSetup(settings)?.brief).toBe("Summ");
    expect(saveWorkflow).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(SETUP_EDIT_SAVE_DELAY_MS);
    });
    await settle();
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
    expect(saveWorkflow.mock.calls[0][0].settings).toEqual(settings);
    expect(saveWorkflow.mock.calls[0][1]).toEqual({ snapshot: false });
    await finishSave();
  });

  it("never has two saves of one workflow in flight", async () => {
    const { result } = renderHook(() => useWorkflowSetupWriter("w1"));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    let third: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.setSetup({ category: "content-pipeline" });
    });
    await settle();
    act(() => {
      second = result.current.setSetup({ run_mode: "app" });
      third = result.current.setSetup({ stage: "review" });
    });
    await settle();
    // The second and third writes wait for the first save, then share one.
    expect(saveWorkflow).toHaveBeenCalledTimes(1);

    await finishSave();
    await act(async () => {
      await first;
    });
    await settle();
    expect(saveWorkflow).toHaveBeenCalledTimes(2);
    expect(
      readWorkflowSetup(saveWorkflow.mock.calls[1][0].settings)?.stage
    ).toBe("review");

    await finishSave();
    await act(async () => {
      await Promise.all([second, third]);
    });
    expect(maxInFlight).toBe(1);
  });

  it("adds a version row only when a write it carries asked for one", async () => {
    const { result } = renderHook(() => useWorkflowSetupWriter("w1"));
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    let third: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.setSetup({ stage: "category" });
    });
    await settle();
    // A setup answer changes no graph, so it adds no version row.
    expect(saveWorkflow.mock.calls[0][1]).toEqual({ snapshot: false });

    // Two writes share the next save. One asked for a version row.
    act(() => {
      second = result.current.setSetup({ run_mode: "app" });
      third = result.current.setSetup({ stage: "done" }, { snapshot: true });
    });
    await finishSave();
    await act(async () => {
      await first;
    });
    await settle();
    expect(saveWorkflow).toHaveBeenCalledTimes(2);
    expect(saveWorkflow.mock.calls[1][1]).toEqual({ snapshot: true });
    await finishSave();
    await act(async () => {
      await Promise.all([second, third]);
    });
  });

  it("saves a waiting edit with the next explicit write, at once", async () => {
    const { result } = renderHook(() => useWorkflowSetupWriter("w1"));
    act(() => {
      result.current.editSetup({ brief: "Summarize" });
    });
    let staged: Promise<void> = Promise.resolve();
    act(() => {
      staged = result.current.setSetup({ stage: "category" });
    });
    await settle();
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
    const saved = readWorkflowSetup(saveWorkflow.mock.calls[0][0].settings);
    expect(saved?.brief).toBe("Summarize");
    expect(saved?.stage).toBe("category");
    await finishSave();
    await act(async () => {
      await staged;
    });

    // The pause that edit was waiting for saves nothing more.
    act(() => {
      jest.advanceTimersByTime(SETUP_EDIT_SAVE_DELAY_MS);
    });
    await settle();
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
  });

  it("rejects an explicit write whose save fails", async () => {
    const { result } = renderHook(() => useWorkflowSetupWriter("w1"));
    let staged: Promise<void> = Promise.resolve();
    act(() => {
      staged = result.current.setSetup({ stage: "review" });
    });
    await settle();
    const outcome = staged.then(
      () => "saved",
      (cause: Error) => cause.message
    );
    await finishSave(new Error("conflict"));
    await expect(outcome).resolves.toBe("conflict");
    expect(addNotification).not.toHaveBeenCalled();
  });

  it("reports a typed edit whose save fails", async () => {
    const { result } = renderHook(() => useWorkflowSetupWriter("w1"));
    act(() => {
      result.current.editSetup({ brief: "S" });
      jest.advanceTimersByTime(SETUP_EDIT_SAVE_DELAY_MS);
    });
    await settle();
    await finishSave(new Error("conflict"));
    await settle();
    expect(addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("conflict")
      })
    );
  });

  it("saves a waiting edit when the writer unmounts", async () => {
    const { result, unmount } = renderHook(() => useWorkflowSetupWriter("w1"));
    act(() => {
      result.current.editSetup({ brief: "Summ" });
    });
    unmount();
    await settle();
    expect(saveWorkflow).toHaveBeenCalledTimes(1);
    expect(
      readWorkflowSetup(saveWorkflow.mock.calls[0][0].settings)?.brief
    ).toBe("Summ");
  });
});
