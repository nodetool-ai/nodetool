/**
 * The Game flow's document access (game-prd § 5.1, criterion 2).
 *
 * What is asserted: a workflow with no `settings.game` reads stage `done`, a
 * patch merges rather than replaces, and the write leaves `settings.setup` —
 * the Workflow flow's own bag — untouched, because both flows write the same
 * settings record.
 */
import { act, renderHook } from "@testing-library/react";

let settings: Record<string, unknown> = {};
const managerState = {
  getWorkflow: () => ({ id: "w1", name: "W", settings, graph: null }),
  getNodeStore: () => undefined,
  updateWorkflow: jest.fn((workflow: { settings: unknown }) => {
    settings = workflow.settings as Record<string, unknown>;
  }),
  saveWorkflow: jest.fn(async () => {})
};
jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector(managerState),
  useWorkflowManagerStore: () => ({ getState: () => managerState })
}));

import { readGameSetup } from "@nodetool-ai/protocol/api-schemas/workflows.js";
import {
  useGameSetupDocument,
  useGameSetupStage,
  useGameSetupWriter
} from "../useGameSetup";

beforeEach(() => {
  jest.clearAllMocks();
  settings = {};
});

describe("useGameSetup", () => {
  it("reads a workflow that never went through the flow as done", () => {
    const { result } = renderHook(() => useGameSetupStage("w1"));
    expect(result.current).toBe("done");
    const { result: doc } = renderHook(() => useGameSetupDocument("w1"));
    expect(doc.current).toBeNull();
  });

  it("merges a patch and persists it", async () => {
    const { result } = renderHook(() => useGameSetupWriter("w1"));
    await act(async () => {
      await result.current.setGame({ stage: "idea", brief: "A fox" });
    });
    await act(async () => {
      await result.current.setGame({ template: "platformer" });
    });
    expect(readGameSetup(settings)).toMatchObject({
      stage: "idea",
      brief: "A fox",
      template: "platformer"
    });
    expect(managerState.saveWorkflow).toHaveBeenCalledTimes(2);
  });

  it("leaves the Workflow flow's own settings bag untouched", async () => {
    settings = { setup: { stage: "review" }, hide_ui: true };
    const { result } = renderHook(() => useGameSetupWriter("w1"));
    await act(async () => {
      await result.current.setGame({ stage: "look" });
    });
    expect(settings["setup"]).toEqual({ stage: "review" });
    expect(settings["hide_ui"]).toBe(true);
  });

  it("rejects rather than resolving quietly when the save is refused", async () => {
    managerState.saveWorkflow.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useGameSetupWriter("w1"));
    await expect(result.current.setGame({ stage: "idea" })).rejects.toThrow(
      "offline"
    );
  });
});
