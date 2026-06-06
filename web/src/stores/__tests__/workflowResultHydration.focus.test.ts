import type { Asset } from "../ApiTypes";
import {
  hydrateWorkflowResultsFromAssets,
  HYDRATED_JOB_ID
} from "../workflowResultHydration";
import useWorkflowRunsStore from "../WorkflowRunsStore";
import { useWorkflowAssetStore } from "../WorkflowAssetStore";

jest.mock("../WorkflowAssetStore", () => ({
  useWorkflowAssetStore: { getState: jest.fn() }
}));

const imageAsset = (id: string, nodeId: string): Asset =>
  ({
    id,
    node_id: nodeId,
    user_id: "u",
    workflow_id: "wf",
    parent_id: "u",
    name: `${id}.png`,
    content_type: "image/png",
    metadata: null,
    created_at: "2026-01-01T00:00:00Z",
    get_url: null,
    thumb_url: null
  }) as Asset;

describe("hydrateWorkflowResultsFromAssets — focus", () => {
  beforeEach(() => {
    useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
    (useWorkflowAssetStore.getState as jest.Mock).mockReturnValue({
      loadWorkflowAssets: jest.fn().mockResolvedValue([imageAsset("a1", "n1")])
    });
  });

  it("focuses the hydrated run when no real run exists", async () => {
    await hydrateWorkflowResultsFromAssets("wf");
    expect(useWorkflowRunsStore.getState().getFocusedJob("wf")).toBe(
      HYDRATED_JOB_ID
    );
  });

  it("does NOT steal focus from a real run that already started", async () => {
    useWorkflowRunsStore.getState().recordRun({
      jobId: "real-job",
      workflowId: "wf",
      state: "running",
      startedAt: 1
    });
    expect(useWorkflowRunsStore.getState().getFocusedJob("wf")).toBe("real-job");

    await hydrateWorkflowResultsFromAssets("wf");

    // Focus stays on the live run; the hydrated bucket is not even registered.
    expect(useWorkflowRunsStore.getState().getFocusedJob("wf")).toBe("real-job");
    expect(
      useWorkflowRunsStore
        .getState()
        .getRuns("wf")
        .some((r) => r.jobId === HYDRATED_JOB_ID)
    ).toBe(false);
  });
});
