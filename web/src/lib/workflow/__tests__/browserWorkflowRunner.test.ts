import { globalWebSocketManager } from "../../websocket/GlobalWebSocketManager";
import {
  __setBrowserRunnerLoader,
  canRunGraphInBrowser,
  canRunGraphInBrowserSync,
  runBrowserGraphJob
} from "../browserWorkflowRunner";
import type { WorkflowGraph } from "../../../stores/ApiTypes";

const browserGraph = (type: string): WorkflowGraph =>
  ({
    nodes: [{ id: "n1", type, data: { value: "x" } }],
    edges: []
  }) as unknown as WorkflowGraph;

/** A registry that recognizes any "browser.*" node type. */
const fakeRegistry = { has: (type: string) => type.startsWith("browser.") };

type RunResultish = {
  status: string;
  outputs?: Record<string, unknown[]>;
  error?: string;
};

/** Build a runBrowserWorkflow-shaped generator that streams then returns. */
function makeGen(
  messages: Array<Record<string, unknown>>,
  result: RunResultish
): () => AsyncGenerator<Record<string, unknown>, RunResultish, void> {
  return async function* () {
    for (const message of messages) {
      yield message;
    }
    return { outputs: {}, ...result };
  };
}

function installFakeRunner(
  gen: () => AsyncGenerator<Record<string, unknown>, RunResultish, void>,
  onRun?: (opts: Record<string, unknown>) => void
): void {
  __setBrowserRunnerLoader(async () => ({
    wf: {
      createBrowserRegistry: () => fakeRegistry,
      runBrowserWorkflow: (opts: Record<string, unknown>) => {
        onRun?.(opts);
        return gen();
      }
    } as never,
    nodeClasses: []
  }));
}

const completed = (): ReturnType<typeof makeGen> =>
  makeGen([], { status: "completed" });

afterEach(() => {
  __setBrowserRunnerLoader(null);
  jest.restoreAllMocks();
});

describe("canRunGraphInBrowser", () => {
  it("is true when every node type is in the browser registry", async () => {
    installFakeRunner(completed());
    expect(await canRunGraphInBrowser(browserGraph("browser.Const"))).toBe(true);
  });

  it("is false when a node type is unknown to the browser registry", async () => {
    installFakeRunner(completed());
    expect(await canRunGraphInBrowser(browserGraph("server.Image"))).toBe(false);
  });

  it("is false for an empty graph", async () => {
    installFakeRunner(completed());
    expect(
      await canRunGraphInBrowser({ nodes: [], edges: [] } as WorkflowGraph)
    ).toBe(false);
  });

  it("is false (no throw) when the browser runner can't be loaded", async () => {
    __setBrowserRunnerLoader(async () => null);
    expect(await canRunGraphInBrowser(browserGraph("browser.Const"))).toBe(
      false
    );
  });

  it("does not load the heavy runner in a unit-test process by default", async () => {
    __setBrowserRunnerLoader(null);
    expect(await canRunGraphInBrowser(browserGraph("browser.Const"))).toBe(
      false
    );
  });
});

describe("canRunGraphInBrowserSync", () => {
  it("is false while cold (and warms), true once the runner is loaded", async () => {
    installFakeRunner(completed());

    // Cold cache: returns false synchronously, schedules a background warm.
    expect(canRunGraphInBrowserSync(browserGraph("browser.Const"))).toBe(false);

    // Force the load to settle, then the sync decision reflects the registry.
    await canRunGraphInBrowser(browserGraph("browser.Const"));

    expect(canRunGraphInBrowserSync(browserGraph("browser.Const"))).toBe(true);
    expect(canRunGraphInBrowserSync(browserGraph("server.Image"))).toBe(false);
  });
});

describe("runBrowserGraphJob", () => {
  it("streams messages through deliverLocal and collects node outputs", async () => {
    const deliver = jest.spyOn(globalWebSocketManager, "deliverLocal");
    installFakeRunner(
      makeGen(
        [
          { type: "job_update", status: "running" },
          {
            type: "node_update",
            node_id: "n1",
            status: "completed",
            result: { output: "x" }
          },
          { type: "output_update", node_id: "n1", value: "x" }
        ],
        { status: "completed", outputs: { greet: ["x"] } }
      )
    );

    const result = await runBrowserGraphJob({
      graph: browserGraph("browser.Const"),
      workflowId: "wf-1"
    });

    expect(result.success).toBe(true);
    expect(result.outputs.n1).toEqual({ output: "x" });
    // Every emitted message is routed into the shared pipeline.
    expect(deliver).toHaveBeenCalledTimes(3);
    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ type: "job_update", status: "running" })
    );
  });

  it("passes a stable job id and the workflow id to the runner", async () => {
    let captured: Record<string, unknown> | undefined;
    installFakeRunner(completed(), (opts) => {
      captured = opts;
    });

    await runBrowserGraphJob({
      graph: browserGraph("browser.Const"),
      workflowId: "wf-7",
      jobId: "job-42"
    });

    expect(captured?.jobId).toBe("job-42");
    expect(captured?.workflowId).toBe("wf-7");
  });

  it("reports a failed run with its error", async () => {
    installFakeRunner(
      makeGen(
        [
          {
            type: "node_update",
            node_id: "n1",
            status: "error",
            error: "boom"
          }
        ],
        { status: "failed", error: "boom" }
      )
    );

    const result = await runBrowserGraphJob({
      graph: browserGraph("browser.Const"),
      workflowId: "wf-1"
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("boom");
  });

  it("returns gracefully when the runner is unavailable", async () => {
    __setBrowserRunnerLoader(async () => null);
    const result = await runBrowserGraphJob({
      graph: browserGraph("browser.Const"),
      workflowId: "wf-1"
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unavailable/i);
  });

  it("honors a pre-aborted signal", async () => {
    installFakeRunner(completed());
    const ctrl = new AbortController();
    ctrl.abort();
    const result = await runBrowserGraphJob({
      graph: browserGraph("browser.Const"),
      workflowId: "wf-1",
      signal: ctrl.signal
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Aborted");
  });
});
