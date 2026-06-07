import { renderHook } from "@testing-library/react";
import { useNodeGenerations } from "../useNodeGenerations";
import useResultsStore from "../../../stores/ResultsStore";
import { useWorkflowAssetStore } from "../../../stores/WorkflowAssetStore";

jest.mock("../../../contexts/NodeContext", () => ({
  useNodes: (selector: (state: unknown) => unknown) =>
    selector({
      findNode: () => undefined,
      updateNodeData: () => undefined
    })
}));

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
});

it("returns merged generations with latest as current", () => {
  useResultsStore.getState().upsertLiveGeneration("wf", "n1", "j1", {
    createdAt: 1,
    status: "completed",
    outputs: { output: "only" }
  });
  const { result } = renderHook(() => useNodeGenerations("wf", "n1"));
  expect(result.current.generations.map((g) => g.id)).toEqual(["j1"]);
  expect(result.current.current?.id).toBe("j1");
});
