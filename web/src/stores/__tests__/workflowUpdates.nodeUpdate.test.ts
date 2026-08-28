import type { NodeUpdate, WorkflowAttributes } from "../ApiTypes";
import { stub } from "../../test-utils/doubles";
import useErrorStore from "../ErrorStore";
import useExecutionTimeStore, {
  resetExecutionClock,
  setExecutionClock
} from "../ExecutionTimeStore";
import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import { handleUpdate } from "../workflowUpdates";

const mockWorkflow = {
  id: "workflow-1",
  name: "Workflow 1"
} as WorkflowAttributes;

const runnerStore = (state: string) => ({
  getState: () => ({
    job_id: "job-1",
    state,
    addNotification: jest.fn(),
    dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
});

const nodeUpdate = (patch: Partial<NodeUpdate>): NodeUpdate =>
  stub<NodeUpdate>({
    type: "node_update",
    node_id: "n1",
    node_name: "Node 1",
    node_type: "test.Node",
    status: "running",
    job_id: "job-1",
    ...patch
  });

const send = (update: NodeUpdate, state = "running") =>
  handleUpdate(
    mockWorkflow,
    update,
    runnerStore(state) as never,
    () => undefined
  );

const timing = () =>
  useExecutionTimeStore.getState().getTiming("workflow-1", "job-1", "n1");

beforeEach(() => {
  useResultsStore.setState({ liveGenerations: {} } as never);
  useStatusStore.setState({ statuses: {} } as never);
  useErrorStore.setState({ errors: {} } as never);
  useExecutionTimeStore.setState({ timings: {} } as never);
  resetExecutionClock();
});

afterEach(() => {
  resetExecutionClock();
});

describe("handleUpdate — node_update execution timing", () => {
  it("starts the timer on the first active status and leaves it alone on the next one", () => {
    let now = 1000;
    setExecutionClock(() => now);

    send(nodeUpdate({ status: "starting" }));
    now = 2000;
    send(nodeUpdate({ status: "running" }));
    now = 3000;
    send(nodeUpdate({ status: "booting" }));

    expect(timing()).toEqual({ startTime: 1000 });
  });

  it("restarts the timer when a node becomes active again after completing", () => {
    let now = 1000;
    setExecutionClock(() => now);

    send(nodeUpdate({ status: "running" }));
    now = 2000;
    send(nodeUpdate({ status: "completed", result: { output: 1 } }));
    now = 3000;
    send(nodeUpdate({ status: "running" }));

    expect(timing()).toEqual({ startTime: 3000 });
  });

  it("ends the timer on completed", () => {
    let now = 1000;
    setExecutionClock(() => now);

    send(nodeUpdate({ status: "running" }));
    now = 2500;
    send(nodeUpdate({ status: "completed", result: { output: 1 } }));

    expect(timing()).toEqual({ startTime: 1000, endTime: 2500 });
  });

  it("ends the timer on error", () => {
    let now = 1000;
    setExecutionClock(() => now);

    send(nodeUpdate({ status: "running" }));
    now = 4000;
    send(nodeUpdate({ status: "error", error: "boom" }));

    expect(timing()).toEqual({ startTime: 1000, endTime: 4000 });
    expect(useErrorStore.getState().getError("workflow-1", "job-1", "n1")).toBe(
      "boom"
    );
  });

  it("records no timing for a node_update carrying no job_id", () => {
    send(nodeUpdate({ status: "running", job_id: undefined }));

    expect(timing()).toBeUndefined();
    expect(
      useStatusStore.getState().getStatus("workflow-1", "job-1", "n1")
    ).toBeUndefined();
  });
});

describe("handleUpdate — node_update on a cancelled run", () => {
  it("writes nothing once the runner is cancelled", () => {
    const store = {
      getState: jest.fn(),
      temporal: { getState: jest.fn() }
    };

    handleUpdate(
      mockWorkflow,
      nodeUpdate({ status: "running", properties: { prompt: "hi" } }),
      runnerStore("cancelled") as never,
      () => store as never
    );

    expect(timing()).toBeUndefined();
    expect(
      useStatusStore.getState().getStatus("workflow-1", "job-1", "n1")
    ).toBeUndefined();
    expect(store.getState).not.toHaveBeenCalled();
  });
});

describe("handleUpdate — node_update properties write-back", () => {
  const makeNodeStore = (isTracking: boolean) => {
    const updateNodeData = jest.fn();
    const pause = jest.fn();
    const resume = jest.fn();
    return {
      updateNodeData,
      pause,
      resume,
      store: {
        getState: () => ({
          findNode: () => ({
            data: { properties: { prompt: "edited" }, dynamic_properties: {} }
          }),
          updateNodeData
        }),
        temporal: { getState: () => ({ isTracking, pause, resume }) }
      }
    };
  };

  it("writes merged properties quietly, pausing undo tracking around the write", () => {
    const nodeStore = makeNodeStore(true);

    handleUpdate(
      mockWorkflow,
      nodeUpdate({
        status: "completed",
        result: { output: 1 },
        properties: { prompt: "stale", seed: 42 }
      }),
      runnerStore("running") as never,
      () => nodeStore.store as never
    );

    expect(nodeStore.pause).toHaveBeenCalledTimes(1);
    expect(nodeStore.resume).toHaveBeenCalledTimes(1);
    expect(nodeStore.updateNodeData).toHaveBeenCalledWith(
      "n1",
      {
        properties: { prompt: "edited", seed: 42 },
        dynamic_properties: {}
      },
      { quiet: true }
    );
  });

  it("leaves history alone when tracking is already paused", () => {
    const nodeStore = makeNodeStore(false);

    handleUpdate(
      mockWorkflow,
      nodeUpdate({ status: "completed", properties: { seed: 1 } }),
      runnerStore("running") as never,
      () => nodeStore.store as never
    );

    expect(nodeStore.pause).not.toHaveBeenCalled();
    expect(nodeStore.resume).not.toHaveBeenCalled();
    expect(nodeStore.updateNodeData).toHaveBeenCalled();
  });

  const storeWithDynamic = (updateNodeData: jest.Mock) => ({
    getState: () => ({
      findNode: () => ({
        data: { properties: {}, dynamic_properties: { prompt: "user typed" } }
      }),
      updateNodeData
    }),
    temporal: {
      getState: () => ({
        isTracking: false,
        pause: jest.fn(),
        resume: jest.fn()
      })
    }
  });

  it("refreshes an existing dynamic slot on an ordinary node", () => {
    const updateNodeData = jest.fn();

    handleUpdate(
      mockWorkflow,
      nodeUpdate({
        status: "completed",
        properties: { prompt: "from the run" }
      }),
      runnerStore("running") as never,
      () => storeWithDynamic(updateNodeData) as never
    );

    expect(updateNodeData).toHaveBeenCalledWith(
      "n1",
      {
        properties: {},
        dynamic_properties: { prompt: "from the run" }
      },
      { quiet: true }
    );
  });

  it("keeps the user's dynamic slot on a dynamic-schema node", () => {
    const updateNodeData = jest.fn();

    handleUpdate(
      mockWorkflow,
      nodeUpdate({
        status: "completed",
        node_type: "fal.DynamicFal",
        properties: { prompt: "from the run" }
      }),
      runnerStore("running") as never,
      () => storeWithDynamic(updateNodeData) as never
    );

    expect(updateNodeData).toHaveBeenCalledWith(
      "n1",
      {
        properties: {},
        dynamic_properties: { prompt: "user typed" }
      },
      { quiet: true }
    );
  });

  it("applies properties on the error path too", () => {
    const nodeStore = makeNodeStore(false);

    handleUpdate(
      mockWorkflow,
      nodeUpdate({
        status: "error",
        error: "boom",
        properties: { seed: 7 }
      }),
      runnerStore("running") as never,
      () => nodeStore.store as never
    );

    expect(nodeStore.updateNodeData).toHaveBeenCalled();
  });

  it("does nothing when the update carries an empty property bag", () => {
    const nodeStore = makeNodeStore(true);

    handleUpdate(
      mockWorkflow,
      nodeUpdate({ status: "completed", properties: {} }),
      runnerStore("running") as never,
      () => nodeStore.store as never
    );

    expect(nodeStore.updateNodeData).not.toHaveBeenCalled();
    expect(nodeStore.pause).not.toHaveBeenCalled();
  });
});
