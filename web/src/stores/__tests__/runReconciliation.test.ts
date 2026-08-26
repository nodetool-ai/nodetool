/**
 * Reload-time run reconciliation: a workflow opened with an idle runner
 * discovers the server's in-flight jobs and reattaches, so a page reload
 * neither kills the run nor comes back blank.
 */
import {
  startRunReconciliation,
  stopRunReconciliation
} from "../runReconciliation";
import { asMock } from "../../test-utils/doubles";
import { getPendingResumeJobId } from "../resumeJobHint";
import { trpcClient } from "../../trpc/client";
import { globalWebSocketManager } from "../../lib/websocket/GlobalWebSocketManager";
import { isAuthRequired } from "../../lib/runtimeConfig";
import { useAuth } from "../useAuth";
import type { WorkflowAttributes } from "../ApiTypes";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    jobs: {
      list: { query: jest.fn() }
    }
  }
}));

jest.mock("../../lib/websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    send: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock("../../lib/runtimeConfig", () => ({
  isAuthRequired: jest.fn(() => false)
}));

jest.mock("../useAuth", () => ({
  useAuth: {
    getState: jest.fn(() => ({ state: "logged_in" })),
    subscribe: jest.fn(() => jest.fn())
  }
}));

const mockListQuery = trpcClient.jobs.list.query as jest.Mock;
const mockSend = globalWebSocketManager.send as jest.Mock;
const mockIsAuthRequired = isAuthRequired as jest.Mock;
const mockAuthGetState = useAuth.getState as jest.Mock;
const mockAuthSubscribe = asMock(useAuth.subscribe);

const workflow: WorkflowAttributes = {
  id: "wf",
  name: "WF"
} as WorkflowAttributes;

type RunnerState = { job_id: string | null; state: string };

const makeRunnerStore = (overrides: Partial<RunnerState> = {}) => {
  const state: RunnerState = { job_id: null, state: "idle", ...overrides };
  const reconnectWithWorkflow = jest.fn(async (jobId: string) => {
    state.job_id = jobId;
    state.state = "connecting";
  });
  return {
    state,
    reconnectWithWorkflow,
    getState: () => ({ ...state, reconnectWithWorkflow })
  };
};

const job = (id: string, status: string) => ({
  id,
  status,
  workflow_id: "wf"
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  stopRunReconciliation("wf");
  mockIsAuthRequired.mockReturnValue(false);
  mockAuthGetState.mockReturnValue({ state: "logged_in" });
  mockListQuery.mockResolvedValue({ jobs: [] });
});

it("reattaches the newest in-flight job through the runner store", async () => {
  mockListQuery.mockResolvedValue({
    jobs: [job("new", "running"), job("done", "completed"), job("old", "running")]
  });
  const runnerStore = makeRunnerStore();

  startRunReconciliation("wf", workflow, runnerStore as never);
  await flush();

  expect(mockListQuery).toHaveBeenCalledWith({ workflow_id: "wf", limit: 20 });
  expect(runnerStore.reconnectWithWorkflow).toHaveBeenCalledWith(
    "new",
    workflow
  );
});

it("parks the handshake resume hint while reattaching, then clears it", async () => {
  mockListQuery.mockResolvedValue({ jobs: [job("A", "running")] });
  const runnerStore = makeRunnerStore();
  let hintDuringReconnect: string | null = null;
  runnerStore.reconnectWithWorkflow.mockImplementation(async () => {
    hintDuringReconnect = getPendingResumeJobId();
  });

  startRunReconciliation("wf", workflow, runnerStore as never);
  await flush();

  expect(hintDuringReconnect).toBe("A");
  expect(getPendingResumeJobId()).toBeNull();
});

it("adopts concurrent siblings with a bare reconnect_job replaying from 0", async () => {
  mockListQuery.mockResolvedValue({
    jobs: [job("A", "running"), job("B", "running"), job("C", "queued")]
  });
  const runnerStore = makeRunnerStore();

  startRunReconciliation("wf", workflow, runnerStore as never);
  await flush();

  expect(runnerStore.reconnectWithWorkflow).toHaveBeenCalledWith(
    "A",
    workflow
  );
  expect(mockSend).toHaveBeenCalledWith({
    type: "reconnect_job",
    command: "reconnect_job",
    data: { job_id: "B", workflow_id: "wf", last_seq: 0 }
  });
  expect(mockSend).toHaveBeenCalledWith({
    type: "reconnect_job",
    command: "reconnect_job",
    data: { job_id: "C", workflow_id: "wf", last_seq: 0 }
  });
});

it("does nothing when every job already settled", async () => {
  mockListQuery.mockResolvedValue({
    jobs: [job("A", "completed"), job("B", "cancelled"), job("C", "failed")]
  });
  const runnerStore = makeRunnerStore();

  startRunReconciliation("wf", workflow, runnerStore as never);
  await flush();

  expect(runnerStore.reconnectWithWorkflow).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

it("leaves a runner that already tracks a job alone", async () => {
  const runnerStore = makeRunnerStore({ job_id: "live", state: "running" });

  startRunReconciliation("wf", workflow, runnerStore as never);
  await flush();

  expect(mockListQuery).not.toHaveBeenCalled();
});

it("yields to a run that started while the job list was in flight", async () => {
  const runnerStore = makeRunnerStore();
  mockListQuery.mockImplementation(async () => {
    runnerStore.state.job_id = "fresh";
    runnerStore.state.state = "connecting";
    return { jobs: [job("A", "running")] };
  });

  startRunReconciliation("wf", workflow, runnerStore as never);
  await flush();

  expect(runnerStore.reconnectWithWorkflow).not.toHaveBeenCalled();
});

it("stopRunReconciliation cancels a pending reconcile", async () => {
  mockListQuery.mockResolvedValue({ jobs: [job("A", "running")] });
  const runnerStore = makeRunnerStore();

  startRunReconciliation("wf", workflow, runnerStore as never);
  stopRunReconciliation("wf");
  await flush();

  expect(runnerStore.reconnectWithWorkflow).not.toHaveBeenCalled();
});

it("waits for login when auth is required and still settling", async () => {
  mockIsAuthRequired.mockReturnValue(true);
  mockAuthGetState.mockReturnValue({ state: "init" });
  let authListener: ((auth: { state: string }) => void) | undefined;
  mockAuthSubscribe.mockImplementation((listener) => {
    authListener = listener;
    return jest.fn();
  });
  mockListQuery.mockResolvedValue({ jobs: [job("A", "running")] });
  const runnerStore = makeRunnerStore();

  startRunReconciliation("wf", workflow, runnerStore as never);
  await flush();
  expect(mockListQuery).not.toHaveBeenCalled();

  authListener?.({ state: "logged_in" });
  await flush();

  expect(runnerStore.reconnectWithWorkflow).toHaveBeenCalledWith(
    "A",
    workflow
  );
});

it("gives up when auth settles logged out", async () => {
  mockIsAuthRequired.mockReturnValue(true);
  mockAuthGetState.mockReturnValue({ state: "loading" });
  const unsubscribe = jest.fn();
  let authListener: ((auth: { state: string }) => void) | undefined;
  mockAuthSubscribe.mockImplementation((listener) => {
    authListener = listener;
    return unsubscribe;
  });
  const runnerStore = makeRunnerStore();

  startRunReconciliation("wf", workflow, runnerStore as never);
  authListener?.({ state: "logged_out" });
  await flush();

  expect(mockListQuery).not.toHaveBeenCalled();
  expect(unsubscribe).toHaveBeenCalled();
});
