/**
 * The parts of the runtime that are pure wiring: where a run's output lands,
 * what a variable starts as and whether it survives a restart, what happens
 * when a run collides with a live one, and what a timeout does.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  }) as unknown as Workflow;

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

const renderRuntime = (workflowId: string, document: ApplicationDocument) => {
  disposeAppRuntimeStore(appInstanceId(workflowId));
  return renderHook(() =>
    useAppRuntime(makeWorkflow(workflowId), { document })
  );
};

/** Start a run and let the server answer with a job id. */
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

beforeEach(async () => {
  mockHandlers.clear();
  mockRun.mockClear();
  mockCancel.mockClear();
  mockRunnerState.job_id = null;
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

    await startRun(result.current, "second", "job-2");
    emit({ type: "output_update", job_id: "job-2", node_id: "o1", value: "ok" });

    expect(mockRun.mock.calls[0][0]).toEqual({ prompt: "fixed" });
    const state = result.current.store.getState();
    expect(state.invocations["job-2"].operationId).toBe("second");
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
