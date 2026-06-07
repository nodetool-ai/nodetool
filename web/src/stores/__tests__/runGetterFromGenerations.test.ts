import { getNodeCurrentOutput } from "../nodeGenerationAccessor";
import useResultsStore from "../ResultsStore";
import { useWorkflowAssetStore } from "../WorkflowAssetStore";

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useWorkflowAssetStore.setState({ assetsByWorkflow: {} } as never);
});

describe("getNodeCurrentOutput (run-path accessor)", () => {
  it("returns the upstream node's current output for a handle", () => {
    useResultsStore.getState().upsertLiveGeneration("wf", "up", "j1", {
      createdAt: 1,
      status: "completed",
      outputs: { output: "IMG" }
    });
    expect(getNodeCurrentOutput("wf", "up", undefined, "image")).toBe("IMG");
  });

  it("returns the latest generation when none is explicitly selected", () => {
    useResultsStore.getState().upsertLiveGeneration("wf", "up", "j1", {
      createdAt: 1,
      status: "completed",
      outputs: { output: "OLD" }
    });
    useResultsStore.getState().upsertLiveGeneration("wf", "up", "j2", {
      createdAt: 2,
      status: "completed",
      outputs: { output: "NEW" }
    });
    expect(getNodeCurrentOutput("wf", "up", undefined, "output")).toBe("NEW");
  });

  it("honors the selected generation id", () => {
    useResultsStore.getState().upsertLiveGeneration("wf", "up", "j1", {
      createdAt: 1,
      status: "completed",
      outputs: { output: "OLD" }
    });
    useResultsStore.getState().upsertLiveGeneration("wf", "up", "j2", {
      createdAt: 2,
      status: "completed",
      outputs: { output: "NEW" }
    });
    // Live generation ids default to the jobId.
    expect(getNodeCurrentOutput("wf", "up", "j1", "output")).toBe("OLD");
  });

  it("returns undefined for a node with no generations", () => {
    expect(getNodeCurrentOutput("wf", "missing", undefined, "output")).toBe(
      undefined
    );
  });
});
