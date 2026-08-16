/**
 * The parts of the runtime that are pure wiring: where a run's output lands,
 * what a variable starts as and whether it survives a restart, what happens
 * when a run collides with a live one, and what a timeout does.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { v4 as uuidv4 } from "uuid";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../types/workflow";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockRun = jest.fn().mockResolvedValue(undefined);
const mockCancel = jest.fn().mockResolvedValue(undefined);
const mockRunnerState = {
  job_id: null as string | null,
  run: mockRun,
  cancel: mockCancel,
};

jest.mock("../../../stores/WorkflowRunner", () => ({
  useWorkflowRunner: () => ({
    getState: () => mockRunnerState,
    subscribe: () => () => {},
  }),
}));

const mockHandlers = new Map<
  string,
  (message: Record<string, unknown>) => void
>();

jest.mock("../../../services/WebSocketService", () => ({
  webSocketService: {
    subscribe: (key: string, handler: (m: Record<string, unknown>) => void) => {
      mockHandlers.set(key, handler);
      return () => mockHandlers.delete(key);
    },
  },
}));

jest.mock("../../../services/api", () => ({
  apiService: {
    resolveUrl: (uri: string) => uri,
    getApiHost: () => "http://localhost:7777",
  },
}));

import { useAppRuntime } from "../useAppRuntime";
import { disposeAppRuntimeStore, appInstanceId } from "../appRuntimeStore";
import { variableStorageKey } from "../variablePersistence";

const makeWorkflow = (id: string): Workflow =>
  ({
    id,
    name: "Greeter",
    description: "",
    graph: {
      nodes: [
        {
          id: "n1",
          type: "nodetool.input.StringInput",
          data: { name: "prompt" },
        },
        {
          id: "o1",
          type: "nodetool.output.StringOutput",
          data: { name: "result" },
        },
      ],
      edges: [],
    },
    access: "private",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });

const emit = (message: Record<string, unknown>) => {
  act(() => {
    mockHandlers.forEach((handler) => handler(message));
  });
};

const doc = (
  overrides: Partial<ApplicationDocument> = {}
): ApplicationDocument => ({
  schemaVersion: 3,
  ui: { root: { props: {} }, content: [], zones: {} },
  operations: [
    {
      id: "main",
      name: "Run",
      workflowId: "wf",
      inputs: {},
      outputs: {},
      policy: "replace",
    },
  ],
  resources: [],
  variables: [],
  ...overrides,
});

const renderRuntime = (
  workflowId: string,
  document: ApplicationDocument,
  options: { application?: { id: string; version?: number | null } } = {}
) => {
  disposeAppRuntimeStore(appInstanceId(workflowId));
  return renderHook(() =>
    useAppRuntime(makeWorkflow(workflowId), { document, ...options })
  );
};

/**
 * Start a run. The job id is minted by the runtime before the request goes
 * out, so the ids here are the ones the (mocked) uuid factory hands out in
 * dispatch order.
 */
const startRun = async (
  runtime: { dispatch: (action: { kind: "run"; operationId: string }) => void },
  operationId: string,
  jobId: string
) => {
  await act(async () => {
    runtime.dispatch({ kind: "run", operationId });
  });
  emit({ type: "job_update", job_id: jobId, status: "running" });
};

/** The run options the runtime handed the workflow runner for call `index`. */
const runOptions = (index = 0) =>
  mockRun.mock.calls[index][2] as {
    jobId?: string;
    application?: { id: string; version?: number | null };
  };

beforeEach(async () => {
  mockHandlers.clear();
  mockRun.mockClear();
  mockCancel.mockClear();
  mockRunnerState.job_id = null;
  // jest.setup mocks uuid with one constant value; runs need distinct ids.
  let minted = 0;
  (uuidv4 as jest.Mock).mockImplementation(() => `job-${++minted}`);
  await AsyncStorage.clear();
});

describe("output → variable", () => {
  it("writes a node's streamed value into the variable it maps to", async () => {
    const document = doc({
      operations: [
        {
          id: "main",
          name: "Run",
          workflowId: "wf",
          inputs: {},
          outputs: { o1: { to: "variable", variableId: "answer" } },
          policy: "replace",
        },
      ],
      variables: [
        { id: "answer", name: "answer", scope: "instance", persist: false },
      ],
    });
    const { result } = renderRuntime("wf-out-var", document);

    await startRun(result.current, "main", "job-1");
    emit({ type: "output_update", job_id: "job-1", node_id: "o1", value: "Hi " });
    emit({
      type: "output_update",
      job_id: "job-1",
      node_id: "o1",
      value: "there",
    });

    // Streamed chunks accumulate in the variable the same way they do in the
    // display slot.
    expect(result.current.store.getState().variables.answer).toBe("Hi there");
  });

  it("leaves variables alone when the output only displays", async () => {
    const { result } = renderRuntime("wf-no-var", doc());

    await startRun(result.current, "main", "job-1");
    emit({ type: "output_update", job_id: "job-1", node_id: "o1", value: "hi" });

    expect(result.current.store.getState().variables).toEqual({});
  });
});

describe("variable defaults and persistence", () => {
  const persistedDoc = doc({
    variables: [
      {
        id: "tone",
        name: "tone",
        scope: "user",
        persist: true,
        default: "formal",
      },
      {
        id: "draft",
        name: "draft",
        scope: "instance",
        persist: false,
        default: "empty",
      },
    ],
  });

  it("seeds the declared defaults", async () => {
    const { result } = renderRuntime("wf-defaults", persistedDoc);

    await waitFor(() =>
      expect(result.current.store.getState().variables.tone).toBe("formal")
    );
    expect(result.current.store.getState().variables.draft).toBe("empty");
  });

  it("restores a persisted value over the default and never stores the rest", async () => {
    const first = renderRuntime("wf-persist", persistedDoc);
    await waitFor(() =>
      expect(first.result.current.store.getState().variables.tone).toBe("formal")
    );

    act(() => {
      first.result.current.store.getState().dispatchEvent({
        type: "setVariable",
        variableId: "tone",
        value: "casual",
      });
      first.result.current.store.getState().dispatchEvent({
        type: "setVariable",
        variableId: "draft",
        value: "secret",
      });
    });

    const key = variableStorageKey(appInstanceId("wf-persist"));
    await waitFor(async () =>
      expect(JSON.parse((await AsyncStorage.getItem(key)) ?? "{}")).toEqual({
        tone: "casual",
      })
    );

    first.unmount();
    const second = renderRuntime("wf-persist", persistedDoc);
    await waitFor(() =>
      expect(second.result.current.store.getState().variables.tone).toBe("casual")
    );
    // Instance scope dies with the app: the second run starts on the default.
    expect(second.result.current.store.getState().variables.draft).toBe("empty");
  });
});

describe("run policy", () => {
  const policyDoc = (policy: "replace" | "queue" | "parallel") =>
    doc({
      operations: [
        {
          id: "main",
          name: "Run",
          workflowId: "wf",
          inputs: {},
          outputs: {},
          policy,
        },
      ],
    });

  it("replace cancels the live run before starting", async () => {
    const { result } = renderRuntime("wf-replace", policyDoc("replace"));

    await startRun(result.current, "main", "job-1");
    await startRun(result.current, "main", "job-2");

    expect(mockCancel).toHaveBeenCalledWith("job-1");
    expect(mockRun).toHaveBeenCalledTimes(2);
    expect(result.current.store.getState().invocations["job-1"].status).toBe(
      "cancelled"
    );
  });

  it("queue waits for the live run to settle", async () => {
    const { result } = renderRuntime("wf-queue", policyDoc("queue"));

    await startRun(result.current, "main", "job-1");
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });

    // Still queued behind the first run.
    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockCancel).not.toHaveBeenCalled();

    emit({ type: "job_update", job_id: "job-1", status: "completed" });
    await waitFor(() => expect(mockRun).toHaveBeenCalledTimes(2));
  });

  it("parallel starts immediately and keeps both runs", async () => {
    const { result } = renderRuntime("wf-parallel", policyDoc("parallel"));

    await startRun(result.current, "main", "job-1");
    await startRun(result.current, "main", "job-2");

    expect(mockCancel).not.toHaveBeenCalled();
    const { invocations } = result.current.store.getState();
    expect(invocations["job-1"].status).toBe("running");
    expect(invocations["job-2"].status).toBe("running");
  });
});

describe("timeoutMs", () => {
  const timeoutDoc = doc({
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf",
        inputs: {},
        outputs: {},
        policy: "replace",
        timeoutMs: 30,
      },
    ],
  });

  it("cancels and fails the run when the limit elapses", async () => {
    const { result } = renderRuntime("wf-timeout", timeoutDoc);

    await startRun(result.current, "main", "job-1");

    await waitFor(() => {
      const invocation = result.current.store.getState().invocations["job-1"];
      expect(invocation.status).toBe("failed");
      expect(invocation.error).toContain("timed out");
    });
    expect(mockCancel).toHaveBeenCalledWith("job-1");
  });

  it("clears the timer when the run finishes in time", async () => {
    const { result } = renderRuntime("wf-timeout-ok", timeoutDoc);

    await startRun(result.current, "main", "job-1");
    emit({ type: "job_update", job_id: "job-1", status: "completed" });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(result.current.store.getState().invocations["job-1"].status).toBe(
      "completed"
    );
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe("multiple operations", () => {
  const multiDoc = doc({
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf-multi",
        inputs: {},
        outputs: {},
        policy: "replace",
      },
      {
        id: "second",
        name: "Second",
        workflowId: "wf-multi",
        inputs: { n1: { from: "constant", value: "fixed" } },
        outputs: { o1: { to: "variable", variableId: "second_out" } },
        policy: "replace",
      },
      {
        id: "foreign",
        name: "Foreign",
        workflowId: "wf-elsewhere",
        inputs: {},
        outputs: {},
        policy: "replace",
      },
    ],
    variables: [
      { id: "second_out", name: "second_out", scope: "instance", persist: false },
    ],
  });

  it("runs the operation the action names, not the first one", async () => {
    const { result } = renderRuntime("wf-multi", multiDoc);

    await startRun(result.current, "second", "job-1");
    emit({ type: "output_update", job_id: "job-1", node_id: "o1", value: "ok" });

    expect(mockRun.mock.calls[0][0]).toEqual({ prompt: "fixed" });
    const state = result.current.store.getState();
    expect(state.invocations["job-1"].operationId).toBe("second");
    expect(state.variables.second_out).toBe("ok");
  });

  it("refuses an operation bound to a workflow this screen does not hold", async () => {
    const { result } = renderRuntime("wf-multi-foreign", multiDoc);

    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "foreign" });
    });

    expect(mockRun).not.toHaveBeenCalled();
    const state = result.current.store.getState();
    const failed = Object.values(state.invocations).find(
      (invocation) => invocation.operationId === "foreign"
    );
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toContain("wf-elsewhere");
  });
});

describe("run identity", () => {
  it("sends the application id and released version with the run", async () => {
    const { result } = renderRuntime("wf-release", doc(), {
      application: { id: "app-1", version: 7 },
    });

    await startRun(result.current, "main", "job-1");

    expect(runOptions().application).toEqual({ id: "app-1", version: 7 });
  });

  it("sends a null version for a draft run", async () => {
    const { result } = renderRuntime("wf-draft", doc(), {
      application: { id: "app-1", version: null },
    });

    await startRun(result.current, "main", "job-1");

    expect(runOptions().application).toEqual({ id: "app-1", version: null });
  });

  it("sends the job id it minted, and owns the invocation under it", async () => {
    const { result } = renderRuntime("wf-jobid", doc());

    await startRun(result.current, "main", "job-1");

    expect(runOptions().jobId).toBe("job-1");
    expect(result.current.store.getState().invocations["job-1"]).toBeDefined();
  });
});

describe("message routing", () => {
  const parallelDoc = doc({
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf",
        inputs: {},
        outputs: {},
        policy: "parallel",
      },
      {
        id: "other",
        name: "Other",
        workflowId: "wf",
        inputs: {},
        outputs: {},
        policy: "parallel",
      },
    ],
  });

  it("routes each concurrent run's messages to its own invocation", async () => {
    const { result } = renderRuntime("wf-concurrent", parallelDoc);

    await startRun(result.current, "main", "job-1");
    await startRun(result.current, "other", "job-2");

    // The second run answers first — arrival order says nothing about which
    // invocation a message belongs to.
    emit({
      type: "output_update",
      job_id: "job-2",
      node_id: "o1",
      value: "second",
    });
    emit({
      type: "output_update",
      job_id: "job-1",
      node_id: "o1",
      value: "first",
    });
    emit({ type: "job_update", job_id: "job-2", status: "completed" });

    const state = result.current.store.getState();
    expect(state.outputs["main:o1"]).toMatchObject({
      invocationId: "job-1",
      value: "first",
    });
    expect(state.outputs["other:o1"]).toMatchObject({
      invocationId: "job-2",
      value: "second",
    });
    expect(state.invocations["job-1"].operationId).toBe("main");
    expect(state.invocations["job-1"].status).toBe("running");
    expect(state.invocations["job-2"].operationId).toBe("other");
    expect(state.invocations["job-2"].status).toBe("completed");
    expect(runOptions(0).jobId).toBe("job-1");
    expect(runOptions(1).jobId).toBe("job-2");
  });

  it("ignores a message for a job this app never started", async () => {
    const { result } = renderRuntime("wf-foreign-job", parallelDoc);

    await startRun(result.current, "main", "job-1");
    emit({
      type: "output_update",
      job_id: "someone-elses-job",
      node_id: "o1",
      value: "not mine",
    });
    emit({
      type: "job_update",
      job_id: "someone-elses-job",
      status: "failed",
      error: "boom",
    });

    const state = result.current.store.getState();
    // The slot still holds only what this app's own run seeded: pending, no
    // value, owned by the invocation this app started.
    expect(state.outputs["main:o1"]).toMatchObject({
      invocationId: "job-1",
      status: "pending",
      value: undefined,
    });
    expect(state.invocations["someone-elses-job"]).toBeUndefined();
    expect(state.invocations["job-1"].status).toBe("running");
  });
});

describe("streaming activity", () => {
  it("records what the run says it is doing", async () => {
    const { result } = renderRuntime("wf-activity", doc());

    await startRun(result.current, "main", "job-1");
    emit({
      type: "tool_call_update",
      job_id: "job-1",
      name: "search",
      message: "Searching the web",
    });

    expect(result.current.store.getState().activity["job-1"]).toBe(
      "Searching the web"
    );
  });
});
