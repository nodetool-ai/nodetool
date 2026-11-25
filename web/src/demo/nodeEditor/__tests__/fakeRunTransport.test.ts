import { installFakeRunTransport } from "../fakeRunTransport";
import { createDemoWorkflow } from "../embed/demoWorkflow";

type Delivered = Record<string, unknown>;

function fakeManager() {
  const delivered: Delivered[] = [];
  const send = jest.fn(async (_message: Record<string, unknown>) => undefined);
  const ensureConnection = jest.fn(async () => undefined);
  const isConnectionOpen = jest.fn(() => false);
  const manager = {
    send,
    ensureConnection,
    isConnectionOpen,
    deliverLocal: (message: Delivered) => {
      delivered.push(message);
    }
  };
  return { manager, delivered, originals: { send, ensureConnection, isConnectionOpen } };
}

const timers = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

function runJob(jobId: string) {
  const graph = createDemoWorkflow().graph;
  return {
    type: "run_job",
    command: "run_job",
    data: { job_id: jobId, workflow_id: "wf", graph }
  };
}

describe("installFakeRunTransport", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("answers run_job with a full run, without the network", async () => {
    const { manager, delivered, originals } = fakeManager();
    const uninstall = installFakeRunTransport(manager as never, timers);
    expect(manager.isConnectionOpen()).toBe(true);

    await manager.send(runJob("job-a"));
    jest.runAllTimers();

    expect(originals.send).not.toHaveBeenCalled();
    expect(delivered[0]).toMatchObject({ type: "job_update", status: "running", job_id: "job-a" });
    expect(delivered[delivered.length - 1]).toMatchObject({ type: "job_update", status: "completed" });
    uninstall();
    expect(manager.send).toBe(originals.send);
  });

  it("stops a cancelled run and reports it cancelled", async () => {
    const { manager, delivered } = fakeManager();
    installFakeRunTransport(manager as never, timers);

    await manager.send(runJob("job-b"));
    jest.advanceTimersByTime(300);
    await manager.send({ type: "cancel_job", command: "cancel_job", data: { job_id: "job-b", workflow_id: "wf" } });
    jest.runAllTimers();

    const last = delivered[delivered.length - 1];
    expect(last).toMatchObject({ type: "job_update", status: "cancelled", job_id: "job-b" });
    expect(delivered.some((m) => m.status === "completed" && m.type === "job_update")).toBe(false);
  });
});
