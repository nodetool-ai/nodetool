/**
 * The web adapter around the shared runtime core: which operation a run
 * targets, what a collision with a live run does, where an output lands, and
 * what a declared timeout means.
 */
import React from "react";
import { stub } from "../../../../test-utils/doubles";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApplicationDocument } from "@nodetool-ai/app-runtime";

import type { Workflow } from "../../../../stores/ApiTypes";

jest.mock("../../../../stores/useAuth", () => ({
  useAuth: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "1" } })
}));
jest.mock("../../../../lib/runtimeConfig", () => ({
  isAuthRequired: () => false
}));
jest.mock("../../../../lib/appSession", () => ({
  getAppSessionToken: () => null
}));
jest.mock("../appInstanceApi", () => ({
  defaultAppInstance: jest.fn(),
  loadAppInstance: jest.fn(),
  saveAppInstance: jest.fn(),
  reserveAppRun: jest.fn(),
  updateAppRun: jest.fn(),
  getAppRun: jest.fn()
}));
import {
  defaultAppInstance,
  saveAppInstance,
  reserveAppRun,
  updateAppRun,
  getAppRun,
  type ServerAppInstance
} from "../appInstanceApi";

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
    subscribe: (
      _id: string,
      handler: (message: Record<string, unknown>) => void
    ) => {
      subscribers.push(handler);
      return () => {
        const at = subscribers.indexOf(handler);
        if (at >= 0) {
          subscribers.splice(at, 1);
        }
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
const getScriptVersion = jest.fn(
  async (input: { id: string; version: number }) => {
    if (input.version < 1) {
      throw new Error("JS script version not found");
    }
    return getScript(input);
  }
);
jest.mock("../../../../trpc/client", () => ({
  trpcClient: {
    jobs: { cancel: { mutate: (input: { id: string }) => cancelJob(input) } },
    jsScripts: {
      get: { query: (input: { id: string }) => getScript(input) },
      documentVersions: {
        get: {
          query: (input: { id: string; version: number }) =>
            getScriptVersion(input)
        }
      }
    }
  }
}));

const runJsScript = jest.fn();
jest.mock("../../../jsScript/runJsScript", () => ({
  runJsScript: (
    id: string,
    inputs: Record<string, unknown>,
    inputStreams?: Record<string, unknown[]>,
    version?: number,
    onLine?: (line: unknown) => void
  ) => runJsScript(id, inputs, inputStreams, version, onLine)
}));

import { getWorkflowRunnerStore } from "../../../../stores/WorkflowRunner";
import { useAppRuntime } from "../useAppRuntime";
import {
  appInstanceId,
  disposeAppRuntimeStore,
  workflowInstanceId
} from "../appRuntimeStore";

interface FakeRunnerState {
  job_id: string | null;
  state: string;
  isBrowserRun: boolean;
  run: jest.Mock;
  cancel: jest.Mock;
  streamInput: jest.Mock;
}

const runners = new Map<
  string,
  { getState: () => FakeRunnerState; subscribe: jest.Mock }
>();
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
  const store = {
    getState: () => state,
    subscribe: jest.fn(() => () => undefined)
  };
  runners.set(id, store);
  return store;
};

const runnerState = (id: string): FakeRunnerState =>
  runners.get(id)!.getState();

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
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
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
    for (const handler of [...subscribers]) {
      handler(message);
    }
  });

beforeEach(() => {
  jobCounter = 0;
  runners.clear();
  subscribers.length = 0;
  cancelJob.mockClear();
  getScript.mockClear();
  getScriptVersion.mockClear();
  runJsScript.mockReset();
  window.localStorage.clear();
  disposeAppRuntimeStore(appInstanceId("application:app-script"));
  disposeAppRuntimeStore(workflowInstanceId("wf-a"));
  disposeAppRuntimeStore(appInstanceId("application:app-1"));
  disposeAppRuntimeStore(appInstanceId("application:app-2"));
  (getWorkflowRunnerStore as jest.Mock).mockImplementation(
    (id: string) => runners.get(id) ?? makeRunner(id)
  );
  disposeAppRuntimeStore(appInstanceId("1:server-a"));
  disposeAppRuntimeStore(appInstanceId("1:server-b"));
  jest.mocked(getAppRun).mockResolvedValue({
    status: "completed",
    state_conflict: 0,
    error: null
  });
  serverInstances.clear();
  serverRuns.clear();
  jest.mocked(defaultAppInstance).mockImplementation(async (body) => {
    const input = body as {
      application_id: string;
      snapshot: ServerAppInstance["snapshot"];
      variables: Record<string, unknown>;
    };
    const id = input.application_id === "app-b" ? "server-b" : "server-a";
    const existing = serverInstances.get(id);
    if (existing) {
      return existing;
    }
    const created = {
      id,
      user_id: "1",
      revision: 0,
      variables: input.variables,
      snapshot: input.snapshot
    };
    serverInstances.set(id, created);
    return created;
  });
  jest
    .mocked(saveAppInstance)
    .mockImplementation(async (id, revision, variables) => {
      const existing = serverInstances.get(id)!;
      if (existing.revision !== revision) {
        throw new Error("Conflict");
      }
      const saved = { ...existing, revision: revision + 1, variables };
      serverInstances.set(id, saved);
      return saved;
    });
  jest
    .mocked(reserveAppRun)
    .mockImplementation(async (_id, _operation, logicalId) => {
      const id = `run-${logicalId}`;
      serverRuns.set(id, { status: "running", instance_id: _id });
      return id;
    });
  jest.mocked(updateAppRun).mockImplementation(async (id, values) => {
    serverRuns.set(id, {
      ...serverRuns.get(id),
      ...(values as Record<string, unknown>)
    });
  });
  fetchWorkflow.mockImplementation(async (id: string) =>
    id === "wf-b" ? workflowB : workflowA
  );
});

const serverInstances = new Map<string, ServerAppInstance>();
const serverRuns = new Map<string, Record<string, unknown>>();

it("requests durable script cancellation and reloads state only after server termination", async () => {
  let release: (value: {
    ok: boolean;
    outputs: Record<string, unknown>;
    logs: string[];
    error: string;
    duration_ms: number;
  }) => void = () => undefined;
  const pending = new Promise<Parameters<typeof release>[0]>((resolve) => {
    release = resolve;
  });
  const scriptRunner = jest.fn(() => pending);
  const document = doc({
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
  const hook = renderHook(
    () =>
      useAppRuntime(workflowA, false, {
        document,
        application: { id: "app-a" },
        scriptRunner
      }),
    { wrapper }
  );
  await waitFor(() => expect(hook.result.current.instanceId).toBe("server-a"));
  await waitFor(() =>
    expect(hook.result.current.ioFor("main").inputs).toHaveLength(1)
  );
  act(() => hook.result.current.dispatch({ kind: "run", operationId: "main" }));
  await waitFor(() => expect(scriptRunner).toHaveBeenCalledTimes(1));
  const runId = jest.mocked(reserveAppRun).mock.results[0]!.value;
  const durableId = await runId;
  jest.mocked(getAppRun).mockResolvedValue({
    status: "running",
    state_conflict: 0,
    error: null
  });
  const readsBeforeCancel = jest.mocked(defaultAppInstance).mock.calls.length;
  await act(async () => {
    await hook.result.current.dispatch({ kind: "cancel", operationId: "main" });
  });
  expect(updateAppRun).toHaveBeenCalledWith(durableId, { status: "cancelled" });
  expect(defaultAppInstance).toHaveBeenCalledTimes(readsBeforeCancel);
  expect(cancelJob).not.toHaveBeenCalled();
  serverInstances.set("server-a", {
    ...serverInstances.get("server-a")!,
    revision: serverInstances.get("server-a")!.revision + 1,
    variables: { total: 17 }
  });
  jest.mocked(getAppRun).mockResolvedValue({
    status: "cancelled",
    state_conflict: 0,
    error: null
  });
  await act(async () => {
    release({
      ok: false,
      outputs: {},
      logs: [],
      error: "Cancelled",
      duration_ms: 1
    });
    await pending;
  });
  await waitFor(() =>
    expect(hook.result.current.store.getState().variables.total).toBe(17)
  );
  expect(updateAppRun).not.toHaveBeenCalledWith(durableId, {
    status: "completed"
  });
  hook.unmount();
});

it("records two same-workflow invocations before dispatch and folds only their own output", async () => {
  const document = doc({
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf-a",
        inputs: {},
        outputs: { out1: { to: "variable", variableId: "answer" } },
        policy: "parallel"
      }
    ],
    variables: [
      { id: "answer", name: "Answer", scope: "instance", persist: false }
    ]
  });
  const first = renderRuntime(workflowA, document, { id: "app-a" });
  const second = renderRuntime(workflowA, document, { id: "app-b" });
  await waitFor(() => expect(first.result.current.instanceId).toBe("server-a"));
  await waitFor(() =>
    expect(second.result.current.instanceId).toBe("server-b")
  );
  runnerState("wf-a").run.mockImplementation(async (...args: unknown[]) => {
    const options = args[8] as { invocationId: string; appRunId: string };
    expect(serverRuns.has(options.appRunId)).toBe(true);
    return options.invocationId;
  });
  act(() => {
    first.result.current.dispatch({ kind: "run", operationId: "main" });
    second.result.current.dispatch({ kind: "run", operationId: "main" });
  });
  await waitFor(() => expect(runnerState("wf-a").run).toHaveBeenCalledTimes(2));
  const firstJob = await runnerState("wf-a").run.mock.results[0].value;
  const secondJob = await runnerState("wf-a").run.mock.results[1].value;
  expect(firstJob).not.toBe(secondJob);
  deliver({
    type: "output_update",
    job_id: firstJob,
    node_id: "out1",
    value: "first",
    output_name: "result",
    output_type: "string"
  });
  deliver({
    type: "output_update",
    job_id: secondJob,
    node_id: "out1",
    value: "second",
    output_name: "result",
    output_type: "string"
  });
  // Server transports commit durable state before their terminal notification.
  serverInstances.set("server-a", {
    ...serverInstances.get("server-a")!,
    revision: serverInstances.get("server-a")!.revision + 1,
    variables: { answer: "first", __app_outputs: { "main:out1": "first" } }
  });
  serverInstances.set("server-b", {
    ...serverInstances.get("server-b")!,
    revision: serverInstances.get("server-b")!.revision + 1,
    variables: { answer: "second", __app_outputs: { "main:out1": "second" } }
  });
  serverRuns.set(`run-${firstJob}`, { status: "completed" });
  serverRuns.set(`run-${secondJob}`, { status: "completed" });
  deliver({ type: "job_update", job_id: secondJob, status: "completed" });
  deliver({ type: "job_update", job_id: firstJob, status: "completed" });
  await waitFor(() =>
    expect(serverRuns.get(`run-${firstJob}`)?.status).toBe("completed")
  );
  await waitFor(() =>
    expect(serverRuns.get(`run-${secondJob}`)?.status).toBe("completed")
  );
  expect(first.result.current.store.getState().variables.answer).toBe("first");
  expect(second.result.current.store.getState().variables.answer).toBe(
    "second"
  );
  expect(serverInstances.get("server-a")?.variables.answer).toBe("first");
  expect(serverInstances.get("server-b")?.variables.answer).toBe("second");
  expect(
    jest
      .mocked(saveAppInstance)
      .mock.calls.every((call) => call[2].answer === undefined)
  ).toBe(true);
  first.unmount();
  second.unmount();
});

it("drops late messages from an invocation after switching the working copy", async () => {
  const document = doc({
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf-a",
        inputs: {},
        outputs: { out1: { to: "variable", variableId: "answer" } },
        policy: "parallel"
      }
    ],
    variables: [
      { id: "answer", name: "Answer", scope: "instance", persist: false }
    ]
  });
  const hook = renderHook(
    ({ app }) =>
      useAppRuntime(workflowA, false, { document, application: { id: app } }),
    { initialProps: { app: "app-a" }, wrapper }
  );
  await waitFor(() => expect(hook.result.current.instanceId).toBe("server-a"));
  runnerState("wf-a").run.mockImplementation(
    async (...args: unknown[]) =>
      (args[8] as { invocationId: string }).invocationId
  );
  act(() => hook.result.current.dispatch({ kind: "run", operationId: "main" }));
  await waitFor(() => expect(runnerState("wf-a").run).toHaveBeenCalled());
  const oldJob = await runnerState("wf-a").run.mock.results[0].value;
  hook.rerender({ app: "app-b" });
  await waitFor(() => expect(hook.result.current.instanceId).toBe("server-b"));
  deliver({
    type: "output_update",
    job_id: oldJob,
    node_id: "out1",
    value: "old instance",
    disposition: "replace"
  });
  expect(hook.result.current.store.getState().variables.answer).toBeUndefined();
  expect(
    hook.result.current.store.getState().outputs["main:out1"]
  ).toBeUndefined();
  hook.unmount();
});

it("keeps a preparation reservation on its original instance when input saving overlaps a switch", async () => {
  const document = doc({
    operations: [
      {
        id: "main",
        name: "Run",
        workflowId: "wf-a",
        inputs: {},
        outputs: {},
        policy: "parallel"
      }
    ]
  });
  const hook = renderHook(
    ({ app }) =>
      useAppRuntime(workflowA, false, { document, application: { id: app } }),
    { initialProps: { app: "app-a" }, wrapper }
  );
  await waitFor(() => expect(hook.result.current.instanceId).toBe("server-a"));
  let release: (instance: ServerAppInstance) => void = () => undefined;
  jest.mocked(saveAppInstance).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  act(() => {
    hook.result.current.write(
      { kind: "input", operationId: "main", nodeId: "in1" },
      "original input"
    );
    hook.result.current.dispatch({ kind: "run", operationId: "main" });
  });
  await waitFor(() => expect(saveAppInstance).toHaveBeenCalled());
  hook.rerender({ app: "app-b" });
  await waitFor(() => expect(hook.result.current.instanceId).toBe("server-b"));
  await act(async () => {
    release({ ...serverInstances.get("server-a")!, revision: 1 });
  });
  await waitFor(() =>
    expect(reserveAppRun).toHaveBeenCalledWith(
      "server-a",
      "main",
      expect.any(String)
    )
  );
  expect(runnerState("wf-a").run).not.toHaveBeenCalled();
  hook.unmount();
});
