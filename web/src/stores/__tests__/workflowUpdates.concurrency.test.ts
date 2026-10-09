/**
 * Two concurrent runs (A, B) of one workflow driven through the real runner
 * store and the real handler. Stop, a node error, a lost run, or a socket
 * reconnect concerning one run must not change what the other run shows.
 */
import type {
  EdgeUpdate,
  JobUpdate,
  NodeProgress,
  NodeUpdate,
  WorkflowAttributes
} from "../ApiTypes";
import { stub } from "../../test-utils/doubles";
import { createWorkflowRunnerStore } from "../WorkflowRunner";
import {
  handleUpdate,
  subscribeToWorkflowUpdates,
  unsubscribeFromWorkflowUpdates,
  type JobResumedUpdate
} from "../workflowUpdates";
import useWorkflowRunsStore from "../WorkflowRunsStore";
import useStatusStore from "../StatusStore";
import useResultsStore from "../ResultsStore";
import { edgeKey } from "../nodeKey";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn().mockResolvedValue(undefined),
    send: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn().mockReturnValue(jest.fn()),
    subscribeEvent: jest.fn().mockReturnValue(jest.fn()),
    isConnectionOpen: jest.fn().mockReturnValue(true),
    setResumeJobIdProvider: jest.fn()
  }
}));

jest.mock("../../lib/workflow/browserWorkflowRunner", () => ({
  preloadBrowserRunner: jest.fn(),
  reportBrowserEligibility: jest.fn(),
  runBrowserGraphJob: jest.fn(),
  updateBrowserJobNodeProperties: jest.fn()
}));

jest.mock("../../queryClient", () => ({
  queryClient: {
    invalidateQueries: jest.fn().mockResolvedValue(undefined)
  }
}));

const workflow: WorkflowAttributes = {
  id: "wf",
  name: "WF"
} as WorkflowAttributes;

const getNodeStore = () => undefined;

const jobUpdate = (
  job_id: string,
  status: JobUpdate["status"],
  job_seq?: number
): JobUpdate =>
  ({
    type: "job_update",
    job_id,
    workflow_id: "wf",
    status,
    ...(job_seq !== undefined ? { job_seq } : {})
  }) as JobUpdate;

const nodeUpdate = (
  job_id: string,
  status: string,
  extra: Partial<NodeUpdate> = {}
): NodeUpdate =>
  stub<NodeUpdate>({
    type: "node_update",
    job_id,
    node_id: "n",
    node_name: "n",
    status,
    ...extra
  });

/** Runner store with A as its own job and B as a concurrent sibling run. */
const startTwoRuns = () => {
  const runnerStore = createWorkflowRunnerStore("wf");
  runnerStore.setState({ job_id: "A", state: "running" });
  const send = (data: Parameters<typeof handleUpdate>[1]) =>
    handleUpdate(workflow, data, runnerStore, getNodeStore);
  send(jobUpdate("A", "running", 1));
  send(jobUpdate("B", "running", 1));
  send(nodeUpdate("A", "running", { job_seq: 2 } as Partial<NodeUpdate>));
  send(nodeUpdate("B", "running", { job_seq: 2 } as Partial<NodeUpdate>));
  return { runnerStore, send };
};

const status = (jobId: string) =>
  useStatusStore.getState().getStatus("wf", jobId, "n");

const liveGenerations = () =>
  useResultsStore.getState().getLiveGenerations("wf", "n");

beforeEach(() => {
  jest.clearAllMocks();
  useWorkflowRunsStore.setState({ runs: {}, focusedJob: {}, pinned: {} });
  useStatusStore.setState({ statuses: {} });
  useResultsStore.setState({
    outputResults: {},
    liveGenerations: {},
    providerCosts: {},
    progress: {},
    edges: {},
    chunks: {},
    tasks: {},
    toolCalls: {},
    toolResults: {},
    planningUpdates: {}
  });
});

afterEach(() => {
  unsubscribeFromWorkflowUpdates("wf");
});

describe("F59: Stop on one run", () => {
  it("keeps applying the sibling run's node, progress and edge updates", async () => {
    const { runnerStore, send } = startTwoRuns();

    await runnerStore.getState().cancel();
    expect(runnerStore.getState().state).toBe("cancelled");

    send(nodeUpdate("B", "completed"));
    send(
      stub<NodeProgress>({
        type: "node_progress",
        job_id: "B",
        node_id: "n",
        progress: 4,
        total: 10
      })
    );
    send(
      stub<EdgeUpdate>({
        type: "edge_update",
        job_id: "B",
        workflow_id: "wf",
        edge_id: "e",
        status: "active"
      })
    );

    expect(status("B")).toBe("completed");
    expect(
      useResultsStore.getState().getProgress("wf", "B", "n")
    ).toMatchObject({ progress: 4, total: 10 });
    expect(useResultsStore.getState().edges[edgeKey("wf", "B", "e")]).toMatchObject({
      status: "active"
    });
  });

  it("still drops late updates for the cancelled run", async () => {
    const { runnerStore, send } = startTwoRuns();

    await runnerStore.getState().cancel();
    send(nodeUpdate("A", "running"));

    expect(status("A")).toBeUndefined();
  });

  it("drops late updates for a cancelled run after the runner moves on", async () => {
    const { runnerStore, send } = startTwoRuns();

    await runnerStore.getState().cancel();
    // The user starts another run; the runner now tracks C.
    runnerStore.setState({ job_id: "C", state: "running" });
    send(nodeUpdate("A", "running"));

    expect(status("A")).toBeUndefined();
  });
});

describe("F60: a node error in a sibling run", () => {
  it("leaves the runner's own run running and stoppable", () => {
    const { runnerStore, send } = startTwoRuns();

    send(nodeUpdate("B", "error", { error: "boom" }));

    expect(runnerStore.getState().state).toBe("running");
    expect(status("B")).toBe("error");
  });

  it("still fails the runner when its own job errors", () => {
    const { runnerStore, send } = startTwoRuns();

    send(nodeUpdate("A", "error", { error: "boom" }));

    expect(runnerStore.getState().state).toBe("error");
  });
});

describe("F61: reconnect resumes every non-terminal run", () => {
  const fireOpen = () => {
    const call = jest
      .mocked(globalWebSocketManager.subscribeEvent)
      .mock.calls.filter(([event]) => event === "open")
      .pop();
    expect(call).toBeDefined();
    const onOpen = call ? (call[1] as () => void) : undefined;
    onOpen?.();
  };

  const reconnects = () =>
    jest
      .mocked(globalWebSocketManager.send)
      .mock.calls.map(([msg]) => msg as { command?: string; data?: unknown })
      .filter((msg) => msg.command === "reconnect_job")
      .map((msg) => msg.data);

  it("sends reconnect_job for the runner's job and a running sibling, each from its own cursor", () => {
    const { runnerStore, send } = startTwoRuns();
    subscribeToWorkflowUpdates("wf", workflow, runnerStore, getNodeStore);
    send(nodeUpdate("B", "running", { job_seq: 7 } as Partial<NodeUpdate>));

    fireOpen();

    expect(reconnects()).toEqual(
      expect.arrayContaining([
        { job_id: "A", workflow_id: "wf", last_seq: 2 },
        { job_id: "B", workflow_id: "wf", last_seq: 7 }
      ])
    );
    expect(reconnects()).toHaveLength(2);
  });

  it("does not resume a sibling that already finished", () => {
    const { runnerStore, send } = startTwoRuns();
    subscribeToWorkflowUpdates("wf", workflow, runnerStore, getNodeStore);
    send(jobUpdate("B", "completed", 3));

    fireOpen();

    expect(reconnects()).toEqual([
      { job_id: "A", workflow_id: "wf", last_seq: 2 }
    ]);
  });
});

describe("F62: job_resumed with status unknown", () => {
  const lost = (job_id: string): JobResumedUpdate => ({
    type: "job_resumed",
    job_id,
    workflow_id: "wf",
    status: "unknown",
    last_seq: 0,
    replay_count: 0,
    replay_incomplete: false
  });

  it("clears the lost run's statuses and marks it terminal", () => {
    const { runnerStore, send } = startTwoRuns();

    send(lost("A"));

    expect(runnerStore.getState().state).toBe("idle");
    expect(status("A")).toBeUndefined();
    expect(useWorkflowRunsStore.getState().runs.wf.A.state).toBe("error");
    expect(
      liveGenerations().find((g) => g.jobId === "A")?.status
    ).not.toBe("running");
    // The sibling is untouched.
    expect(status("B")).toBe("running");
    expect(useWorkflowRunsStore.getState().runs.wf.B.state).toBe("running");
  });

  it("settles a lost sibling run without touching the runner", () => {
    const { runnerStore, send } = startTwoRuns();

    send(lost("B"));

    expect(runnerStore.getState().state).toBe("running");
    expect(status("B")).toBeUndefined();
    expect(useWorkflowRunsStore.getState().runs.wf.B.state).toBe("error");
    expect(status("A")).toBe("running");
  });
});

describe("F63: cancelling settles running live generations", () => {
  it("settles the cancelled run's running placeholder and keeps the sibling's", async () => {
    const { runnerStore } = startTwoRuns();

    await runnerStore.getState().cancel();

    const gens = liveGenerations();
    expect(gens.find((g) => g.jobId === "A")?.status).toBe("error");
    expect(gens.find((g) => g.jobId === "B")?.status).toBe("running");
  });

  it("settles them when the server reports the job cancelled", () => {
    const { send } = startTwoRuns();

    send(jobUpdate("B", "cancelled"));

    const gens = liveGenerations();
    expect(gens.find((g) => g.jobId === "B")?.status).toBe("error");
    expect(gens.find((g) => g.jobId === "A")?.status).toBe("running");
  });
});
