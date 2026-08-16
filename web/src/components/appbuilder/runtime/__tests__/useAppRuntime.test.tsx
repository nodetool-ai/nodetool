/**
 * The web adapter around the shared runtime core: which operation a run
 * targets, what a collision with a live run does, where an output lands, and
 * what a declared timeout means.
 */
import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../../stores/ApiTypes";

const fetchWorkflow = jest.fn();

jest.mock("../../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: <T,>(selector: (s: { fetchWorkflow: unknown }) => T) =>
    selector({ fetchWorkflow })
}));

jest.mock("../../../../stores/WorkflowRunner", () => ({
  getWorkflowRunnerStore: jest.fn()
}));

const subscribers: Array<(message: Record<string, unknown>) => void> = [];
jest.mock("../../../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    subscribe: (_id: string, handler: (message: Record<string, unknown>) => void) => {
      subscribers.push(handler);
      return () => {
        const at = subscribers.indexOf(handler);
        if (at >= 0) subscribers.splice(at, 1);
      };
    }
  }
}));

jest.mock("../../../../lib/workflow/browserWorkflowRunner", () => ({
  runBrowserGraphJob: jest.fn(async () => undefined)
}));

const cancelJob = jest.fn(async (_input: { id: string }) => ({ ok: true }));
const getScript = jest.fn(async (_input: { id: string }) => ({
  id: "script-1",
  name: "Adder",
  document: {
    schemaVersion: 1,
    description: "",
    code: 'await output("sum", inputs.a + 1);',
    inputs: [{ name: "a", type: "int" }],
    outputs: [{ name: "sum", type: "int" }],
    packages: [],
    secrets: [],
    timeoutSeconds: 30,
    tests: []
  }
}));
jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    jobs: { cancel: { mutate: (input: { id: string }) => cancelJob(input) } },
    jsScripts: { get: { query: (input: { id: string }) => getScript(input) } }
  }
}));

const runJsScript = jest.fn();
jest.mock("../../../jsScript/runJsScript", () => ({
  runJsScript: (
    id: string,
    inputs: Record<string, unknown>,
    inputStreams?: Record<string, unknown[]>
  ) => runJsScript(id, inputs, inputStreams)
}));

import { getWorkflowRunnerStore } from "../../../../stores/WorkflowRunner";
import { useAppRuntime } from "../useAppRuntime";
import {
  appInstanceId,
  disposeAppRuntimeStore,
  workflowInstanceId
} from "../appRuntimeStore";
import { variableStorageKey } from "../variablePersistence";
import { stub } from "../../../../test-utils/doubles";

interface FakeRunnerState {
  job_id: string | null;
  state: string;
  isBrowserRun: boolean;
  run: jest.Mock;
  cancel: jest.Mock;
  streamInput: jest.Mock;
}

const runners = new Map<string, { getState: () => FakeRunnerState; subscribe: jest.Mock }>();
let jobCounter = 0;

const makeRunner = (id: string) => {
  const state: FakeRunnerState = {
    job_id: null,
    state: "idle",
    isBrowserRun: false,
    run: jest.fn(async () => {
      jobCounter += 1;
      return `job-${id}-${jobCounter}`;
    }),
    cancel: jest.fn(async () => undefined),
    streamInput: jest.fn()
  };
  const store = { getState: () => state, subscribe: jest.fn(() => () => undefined) };
  runners.set(id, store);
  return store;
};

const runnerState = (id: string): FakeRunnerState => runners.get(id)!.getState();

const graph = (nodeId: string, outputId: string) => ({
  nodes: [
    {
      id: nodeId,
      type: "nodetool.input.StringInput",
      data: { name: "prompt", label: "Prompt" }
    },
    {
      id: outputId,
      type: "nodetool.output.StringOutput",
      data: { name: "result", label: "Result" }
    }
  ],
  edges: []
});

const workflowA = stub<Workflow>({
  id: "wf-a",
  name: "A",
  access: "private",
  graph: graph("in1", "out1")
});

const workflowB = stub<Workflow>({
  id: "wf-b",
  name: "B",
  access: "private",
  graph: graph("in2", "out2")
});

const emptyUi = { root: { props: {} }, content: [], zones: {} };

const doc = (over: Partial<ApplicationDocument> = {}): ApplicationDocument => ({
  schemaVersion: 3,
  ui: emptyUi,
  operations: [],
  resources: [],
  variables: [],
  ...over
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const renderRuntime = (
  workflow: Workflow | undefined,
  document?: ApplicationDocument,
  application?: { id: string }
) =>
  renderHook(() => useAppRuntime(workflow, false, { document, application }), {
    wrapper
  });

/** Deliver a streaming message the way the websocket manager would. */
const deliver = (message: Record<string, unknown>) =>
  act(() => {
    for (const handler of [...subscribers]) handler(message);
  });

beforeEach(() => {
  jobCounter = 0;
  runners.clear();
  subscribers.length = 0;
  cancelJob.mockClear();
  getScript.mockClear();
  runJsScript.mockReset();
  window.localStorage.clear();
  disposeAppRuntimeStore(appInstanceId("application:app-script"));
  disposeAppRuntimeStore(workflowInstanceId("wf-a"));
  disposeAppRuntimeStore(appInstanceId("application:app-1"));
  disposeAppRuntimeStore(appInstanceId("application:app-2"));
  (getWorkflowRunnerStore as jest.Mock).mockImplementation(
    (id: string) => runners.get(id) ?? makeRunner(id)
  );
  fetchWorkflow.mockImplementation(async (id: string) =>
    id === "wf-b" ? workflowB : workflowA
  );
});

describe("useAppRuntime — outputs into variables", () => {
  it("writes a node's streamed output to the variable the operation maps it to", async () => {
    const document = doc({
      operations: [
        {
          id: "main",
          name: "Run",
          workflowId: "wf-a",
          inputs: {},
          outputs: { out1: { to: "variable", variableId: "summary" } },
          policy: "replace"
        }
      ],
      variables: [
        { id: "summary", name: "Summary", scope: "instance", persist: false }
      ]
    });
    const { result } = renderRuntime(workflowA, document);

    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    const jobId = runnerState("wf-a").run.mock.results.length
      ? await runnerState("wf-a").run.mock.results[0].value
      : "";

    deliver({
      type: "output_update",
      job_id: jobId,
      node_id: "out1",
      value: "Hello",
      disposition: "replace"
    });

    await waitFor(() =>
      expect(result.current.store.getState().variables.summary).toBe("Hello")
    );
    // The display slot still gets it — a mapped output lands in both places.
    expect(result.current.store.getState().outputs["main:out1"]?.value).toBe(
      "Hello"
    );
  });
});

describe("useAppRuntime — variable defaults and persistence", () => {
  it("seeds declared defaults into the instance", () => {
    const document = doc({
      variables: [
        {
          id: "tone",
          name: "Tone",
          default: "warm",
          scope: "instance",
          persist: false
        }
      ]
    });
    const { result } = renderRuntime(workflowA, document);
    expect(result.current.store.getState().variables.tone).toBe("warm");
  });

  it("restores a persisted user-scoped variable over its declared default", () => {
    window.localStorage.setItem(
      variableStorageKey("workflow:wf-a"),
      JSON.stringify({ tone: "cool" })
    );
    const document = doc({
      variables: [
        {
          id: "tone",
          name: "Tone",
          default: "warm",
          scope: "user",
          persist: true
        }
      ]
    });
    const { result } = renderRuntime(workflowA, document);
    expect(result.current.store.getState().variables.tone).toBe("cool");
  });

  it("writes a persisting variable back, and never an instance one", async () => {
    const document = doc({
      variables: [
        { id: "tone", name: "Tone", scope: "user", persist: true },
        { id: "draft", name: "Draft", scope: "instance", persist: false }
      ]
    });
    const { result } = renderRuntime(workflowA, document);

    act(() => {
      result.current.dispatch({
        kind: "setVariable",
        variableId: "tone",
        value: "cool"
      });
      result.current.dispatch({
        kind: "setVariable",
        variableId: "draft",
        value: "scratch"
      });
    });

    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(variableStorageKey("workflow:wf-a")) ?? "{}"
      );
      expect(stored).toEqual({ tone: "cool" });
    });
  });
});

describe("useAppRuntime — run policy", () => {
  const operation = (policy: "replace" | "queue" | "parallel") =>
    doc({
      operations: [
        {
          id: "main",
          name: "Run",
          workflowId: "wf-a",
          inputs: {},
          outputs: {},
          policy
        }
      ]
    });

  it("replace cancels the run in flight before starting the next", async () => {
    const { result } = renderRuntime(workflowA, operation("replace"));
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    const first = await runnerState("wf-a").run.mock.results[0].value;
    runnerState("wf-a").job_id = first;

    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });

    expect(runnerState("wf-a").cancel).toHaveBeenCalled();
    expect(
      result.current.store.getState().invocations[first]?.status
    ).toBe("cancelled");
    expect(runnerState("wf-a").run).toHaveBeenCalledTimes(2);
  });

  it("queue waits for the run in flight to settle", async () => {
    const { result } = renderRuntime(workflowA, operation("queue"));
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    const first = await runnerState("wf-a").run.mock.results[0].value;

    act(() => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    // Nothing new started while the first invocation is still live.
    expect(runnerState("wf-a").run).toHaveBeenCalledTimes(1);

    deliver({ type: "job_update", job_id: first, status: "completed" });

    await waitFor(() =>
      expect(runnerState("wf-a").run).toHaveBeenCalledTimes(2)
    );
  });

  it("parallel starts immediately and asks the server for a concurrent slot", async () => {
    const { result } = renderRuntime(workflowA, operation("parallel"));
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });

    expect(runnerState("wf-a").cancel).not.toHaveBeenCalled();
    expect(runnerState("wf-a").run).toHaveBeenCalledTimes(2);
    // 7th argument is the runner's `concurrent` flag.
    expect(runnerState("wf-a").run.mock.calls[0][6]).toBe(true);
  });
});

describe("useAppRuntime — timeoutMs", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const timedDoc = doc({
    operations: [
      {
        id: "main",
        name: "Summarize",
        workflowId: "wf-a",
        inputs: {},
        outputs: {},
        policy: "replace",
        timeoutMs: 5_000
      }
    ]
  });

  it("fails the invocation once the declared timeout elapses", async () => {
    const { result } = renderRuntime(workflowA, timedDoc);
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    const jobId = await runnerState("wf-a").run.mock.results[0].value;

    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });

    const invocation = result.current.store.getState().invocations[jobId];
    expect(invocation?.status).toBe("failed");
    expect(invocation?.error).toMatch(/timed out after 5000 ms/);
  });

  it("does not fail a run that finished before the timeout", async () => {
    const { result } = renderRuntime(workflowA, timedDoc);
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    const jobId = await runnerState("wf-a").run.mock.results[0].value;

    deliver({ type: "job_update", job_id: jobId, status: "completed" });
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });

    const invocation = result.current.store.getState().invocations[jobId];
    expect(invocation?.status).toBe("completed");
    expect(invocation?.error).toBeUndefined();
  });
});

describe("useAppRuntime — multiple operations", () => {
  const twoOperations = doc({
    operations: [
      {
        id: "main",
        name: "Draft",
        workflowId: "wf-a",
        inputs: {},
        outputs: {},
        policy: "replace"
      },
      {
        id: "publish",
        name: "Publish",
        workflowId: "wf-b",
        inputs: {},
        outputs: {},
        policy: "replace"
      }
    ]
  });

  it("runs the named operation's own workflow, not operation 0's", async () => {
    const { result } = renderRuntime(workflowA, twoOperations);
    // The second operation's workflow is fetched; wait for its graph to land.
    await waitFor(() =>
      expect(
        result.current.scope.operations.find((o) => o.operationId === "publish")
          ?.nodeIds
      ).toHaveLength(2)
    );

    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "publish" });
    });

    await waitFor(() => expect(runnerState("wf-b").run).toHaveBeenCalled());
    expect(runnerState("wf-a").run).not.toHaveBeenCalled();
    expect(runnerState("wf-b").run.mock.calls[0][1]).toMatchObject({
      id: "wf-b"
    });
  });

  it("covers every operation in the binding scope", async () => {
    const { result } = renderRuntime(workflowA, twoOperations);
    await waitFor(() =>
      expect(result.current.scope.operations).toHaveLength(2)
    );
    expect(
      result.current.scope.operations.map((o) => o.operationId).sort()
    ).toEqual(["main", "publish"]);
  });

  it("refuses a run naming an operation the app does not have", async () => {
    const { result } = renderRuntime(workflowA, twoOperations);
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "ghost" });
    });

    expect(runnerState("wf-a").run).not.toHaveBeenCalled();
    const failed = Object.values(result.current.store.getState().invocations);
    expect(failed).toHaveLength(1);
    expect(failed[0].status).toBe("failed");
    expect(failed[0].error).toMatch(/no operation "ghost"/);
  });
});

describe("useAppRuntime — instance identity", () => {
  const document = doc({
    variables: [{ id: "tone", name: "Tone", scope: "instance", persist: false }]
  });

  it("gives two applications over the same workflow their own state", () => {
    const one = renderRuntime(workflowA, document, { id: "app-1" });
    const two = renderRuntime(workflowA, document, { id: "app-2" });

    act(() => {
      one.result.current.dispatch({
        kind: "setVariable",
        variableId: "tone",
        value: "warm"
      });
    });

    expect(one.result.current.store).not.toBe(two.result.current.store);
    expect(two.result.current.store.getState().variables.tone).toBeUndefined();
  });

  it("keeps one application's state across a remount", () => {
    const first = renderRuntime(workflowA, document, { id: "app-1" });
    act(() => {
      first.result.current.dispatch({
        kind: "setVariable",
        variableId: "tone",
        value: "warm"
      });
    });
    first.unmount();

    const again = renderRuntime(workflowA, document, { id: "app-1" });
    expect(again.result.current.store.getState().variables.tone).toBe("warm");
  });
});

describe("useAppRuntime — messages that arrive before a job id", () => {
  const parallelPair = doc({
    operations: [
      {
        id: "main",
        name: "Draft",
        workflowId: "wf-a",
        inputs: {},
        outputs: {},
        policy: "parallel"
      },
      {
        id: "second",
        name: "Draft again",
        workflowId: "wf-a",
        inputs: {},
        outputs: {},
        policy: "parallel"
      }
    ]
  });

  it("replays each pending start only its own buffered messages", async () => {
    const { result } = renderRuntime(workflowA, parallelPair);
    const resolvers: Array<(jobId: string) => void> = [];
    runnerState("wf-a").run.mockImplementation(
      () => new Promise<string>((resolve) => resolvers.push(resolve))
    );

    act(() => {
      result.current.dispatch({ kind: "run", operationId: "main" });
      result.current.dispatch({ kind: "run", operationId: "second" });
    });
    await waitFor(() => expect(resolvers).toHaveLength(2));

    // Both runs stream before either has reported its job id.
    deliver({
      type: "output_update",
      job_id: "job-main",
      node_id: "out1",
      value: "first",
      disposition: "replace"
    });
    deliver({
      type: "output_update",
      job_id: "job-second",
      node_id: "out1",
      value: "second",
      disposition: "replace"
    });

    await act(async () => {
      resolvers[0]("job-main");
      resolvers[1]("job-second");
    });

    const outputs = result.current.store.getState().outputs;
    expect(outputs["main:out1"]?.value).toBe("first");
    expect(outputs["second:out1"]?.value).toBe("second");
  });

  it("keeps a sibling's buffer when one start fails", async () => {
    const { result } = renderRuntime(workflowA, parallelPair);
    const resolvers: Array<{
      resolve: (jobId: string) => void;
      reject: (error: Error) => void;
    }> = [];
    runnerState("wf-a").run.mockImplementation(
      () =>
        new Promise<string>((resolve, reject) => {
          resolvers.push({ resolve, reject });
        })
    );

    act(() => {
      result.current.dispatch({ kind: "run", operationId: "main" });
      result.current.dispatch({ kind: "run", operationId: "second" });
    });
    await waitFor(() => expect(resolvers).toHaveLength(2));

    deliver({
      type: "output_update",
      job_id: "job-second",
      node_id: "out1",
      value: "second",
      disposition: "replace"
    });

    await act(async () => {
      resolvers[0].reject(new Error("no capacity"));
    });
    await act(async () => {
      resolvers[1].resolve("job-second");
    });

    expect(result.current.store.getState().outputs["second:out1"]?.value).toBe(
      "second"
    );
  });
});

describe("useAppRuntime — design canvas", () => {
  it("keeps its store when the document identity changes", () => {
    const { result, rerender } = renderHook(
      ({ document }: { document: ApplicationDocument }) =>
        useAppRuntime(workflowA, true, { document }),
      { wrapper, initialProps: { document: doc() } }
    );
    const store = result.current.store;
    act(() => {
      store
        .getState()
        .dispatchEvent({ type: "setView", key: "Slider-1:value", value: 7 });
    });

    rerender({ document: doc() });

    expect(result.current.store).toBe(store);
    expect(result.current.store.getState().view["Slider-1:value"]).toBe(7);
  });
});

describe("useAppRuntime — queued runs", () => {
  const queued = doc({
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf-a",
        inputs: {},
        outputs: {},
        policy: "queue"
      }
    ]
  });

  it("drops the wait when the app unmounts before the predecessor settles", async () => {
    const { result, unmount } = renderRuntime(workflowA, queued);
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    const first = await runnerState("wf-a").run.mock.results[0].value;

    act(() => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    expect(runnerState("wf-a").run).toHaveBeenCalledTimes(1);

    const store = result.current.store;
    unmount();
    await act(async () => {
      store.getState().dispatchEvent({
        type: "invocationStatus",
        invocationId: first,
        status: "completed"
      });
    });

    expect(runnerState("wf-a").run).toHaveBeenCalledTimes(1);
  });
});

describe("useAppRuntime — activity", () => {
  it("records what a streaming agent run reports it is doing", async () => {
    const { result } = renderRuntime(workflowA, doc());
    await act(async () => {
      result.current.dispatch({ kind: "run", operationId: "main" });
    });
    const jobId = await runnerState("wf-a").run.mock.results[0].value;

    deliver({
      type: "tool_call_update",
      job_id: jobId,
      name: "search",
      message: "Searching the web"
    });

    await waitFor(() =>
      expect(result.current.store.getState().activity[jobId]).toBe(
        "Searching the web"
      )
    );
  });
});

describe("useAppRuntime — script operations", () => {
  const scriptDoc = () =>
    doc({
      operations: [
        {
          id: "main",
          name: "Add one",
          workflowId: "",
          target: { kind: "script", scriptId: "script-1", scriptVersion: 1 },
          inputs: {},
          outputs: { sum: { to: "variable", variableId: "total" } },
          policy: "replace"
        }
      ],
      variables: [
        { id: "total", name: "Total", scope: "instance", persist: false }
      ]
    });

  const renderScriptApp = () =>
    renderHook(
      () =>
        useAppRuntime(workflowA, false, {
          document: scriptDoc(),
          application: { id: "app-script" }
        }),
      { wrapper }
    );

  it("derives the bindable surface from the script's declared ports", async () => {
    const { result } = renderScriptApp();

    await waitFor(() =>
      expect(result.current.ioFor("main").inputs).toEqual([
        expect.objectContaining({ nodeId: "a", name: "a", kind: "integer" })
      ])
    );
    expect(result.current.ioFor("main").outputs).toEqual([
      expect.objectContaining({ nodeId: "sum", name: "sum" })
    ]);
  });

  it("runs the script and folds its result the way a workflow run folds", async () => {
    runJsScript.mockResolvedValue({
      ok: true,
      outputs: { sum: 4 },
      streamed: [],
      logs: [],
      duration_ms: 3
    });
    const { result } = renderScriptApp();
    await waitFor(() =>
      expect(result.current.ioFor("main").inputs).toHaveLength(1)
    );

    await act(async () => {
      result.current.write({ kind: "input", operationId: "main", nodeId: "a" }, 3);
    });
    await act(async () => {
      await result.current.dispatch({ kind: "run", operationId: "main" });
    });

    // Ports are the wire names, so the mapped value arrives keyed by port name.
    expect(runJsScript).toHaveBeenCalledWith("script-1", { a: 3 }, undefined);
    // No graph was submitted: a script run never touches a workflow runner.
    expect(runnerState("wf-a").run).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.store.getState().variables.total).toBe(4)
    );
  });

  it("reports a failed script run as a failed invocation", async () => {
    runJsScript.mockResolvedValue({
      ok: false,
      logs: [],
      error: "ReferenceError: nope",
      duration_ms: 1
    });
    const { result } = renderScriptApp();
    await waitFor(() =>
      expect(result.current.ioFor("main").outputs).toHaveLength(1)
    );

    await act(async () => {
      await result.current.dispatch({ kind: "run", operationId: "main" });
    });

    await waitFor(() => {
      const state = result.current.store.getState();
      const invocation = Object.values(state.invocations)[0];
      expect(invocation?.status).toBe("failed");
      expect(invocation?.error).toBe("ReferenceError: nope");
    });
  });
});
