import type { WorkflowAttributes } from "../ApiTypes";
import { nodeKey, edgeKey } from "../nodeKey";
import useResultsStore from "../ResultsStore";
import useStatusStore from "../StatusStore";
import useLogsStore from "../LogStore";
import useTraceStore from "../TraceStore";
import { useNotificationStore } from "../NotificationStore";
import { handleUpdate } from "../workflowUpdates";

const workflow = { id: "wf-1", name: "Workflow 1" } as WorkflowAttributes;

const makeRunner = (state = "running") => ({
  getState: () => ({
    job_id: "job-1",
    state,
    queuePosition: null,
    jobReplayCursor: 0,
    addNotification: jest.fn(),
    dequeueNextPendingRun: jest.fn()
  }),
  setState: jest.fn(),
  subscribe: jest.fn()
});

const dispatch = (data: unknown, runner = makeRunner()) =>
  handleUpdate(workflow, data as never, runner as never, () => undefined);

beforeEach(() => {
  useResultsStore.setState({
    outputResults: {},
    providerCosts: {},
    progress: {},
    edges: {},
    chunks: {},
    tasks: {},
    toolCalls: {},
    planningUpdates: {}
  });
  useStatusStore.setState({ statuses: {} });
  useLogsStore.setState({ logs: [], logsByNode: {} });
  useNotificationStore.setState({ notifications: [] });
  useTraceStore.getState().clear();
});

describe("handleUpdate message dispatch", () => {
  it("raises a notification on notification", () => {
    dispatch({
      type: "notification",
      node_id: "n1",
      content: "heads up",
      severity: "warning"
    });

    const { notifications } = useNotificationStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: "warning",
      content: "heads up"
    });
  });

  it("stores edge status on edge_update", () => {
    dispatch({
      type: "edge_update",
      edge_id: "e1",
      status: "message_sent",
      counter: 3,
      job_id: "job-1"
    });

    expect(
      useResultsStore.getState().edges[edgeKey("wf-1", "job-1", "e1")]
    ).toEqual({ status: "message_sent", counter: 3 });
  });

  it("drops an edge_update once the run is cancelled or errored", () => {
    for (const state of ["cancelled", "error"]) {
      dispatch(
        {
          type: "edge_update",
          edge_id: "e1",
          status: "message_sent",
          job_id: "job-1"
        },
        makeRunner(state)
      );
    }

    expect(useResultsStore.getState().edges).toEqual({});
  });

  it("stores the planning update on planning_update", () => {
    dispatch({
      type: "planning_update",
      node_id: "agent-1",
      phase: "generation",
      status: "running",
      job_id: "job-1"
    });

    expect(
      useResultsStore.getState().planningUpdates[
        nodeKey("wf-1", "job-1", "agent-1")
      ]
    ).toMatchObject({ phase: "generation" });
  });

  it("stores the task on task_update", () => {
    dispatch({
      type: "task_update",
      node_id: "agent-1",
      event: "task_created",
      task: { title: "Research", steps: [] },
      job_id: "job-1"
    });

    expect(
      useResultsStore.getState().tasks[nodeKey("wf-1", "job-1", "agent-1")]
    ).toMatchObject({ title: "Research" });
  });

  it("logs a prediction and marks the node booting", () => {
    dispatch({
      type: "prediction",
      node_id: "n1",
      status: "booting",
      logs: "cold start",
      job_id: "job-1"
    });

    expect(useLogsStore.getState().getLogs("wf-1", "n1")[0].content).toBe(
      "cold start"
    );
    expect(useStatusStore.getState().getStatus("wf-1", "job-1", "n1")).toBe(
      "booting"
    );
  });

  it("logs a non-booting prediction without touching status", () => {
    dispatch({
      type: "prediction",
      node_id: "n1",
      status: "running",
      logs: "still going",
      job_id: "job-1"
    });

    expect(useLogsStore.getState().getLogs("wf-1", "n1")).toHaveLength(1);
    expect(
      useStatusStore.getState().getStatus("wf-1", "job-1", "n1")
    ).toBeUndefined();
  });

  it("traces step_result and todo_update while a run is recording", () => {
    useTraceStore.getState().startRun(new Date().toISOString());

    dispatch({
      type: "step_result",
      step: { id: "s1", name: "Gather" },
      is_task_result: true,
      job_id: "job-1"
    });
    dispatch({
      type: "todo_update",
      node_id: "agent-1",
      todos: [{ status: "completed" }, { status: "pending" }],
      job_id: "job-1"
    });

    const events = useTraceStore.getState().events;
    expect(events.map((e) => e.type)).toEqual(["step_result", "todo_update"]);
    expect(events[0].summary).toBe("Step Gather (task result)");
    expect(events[1].summary).toBe("Todos 1/2");
  });

  it("ignores a message type it has no branch for", () => {
    expect(() =>
      dispatch({ type: "message", role: "assistant", content: "hi" })
    ).not.toThrow();
    expect(useLogsStore.getState().logs).toHaveLength(0);
  });
});
