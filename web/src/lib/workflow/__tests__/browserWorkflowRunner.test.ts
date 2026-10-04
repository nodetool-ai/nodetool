import { globalWebSocketManager } from "../../websocket/GlobalWebSocketManager";
import { stub } from "../../../test-utils/doubles";
import {
  __setBrowserRunnerLoader,
  canRunGraphInBrowserSync,
  collectNodeClasses,
  reportBrowserEligibility,
  runBrowserGraphJob
} from "../browserWorkflowRunner";
import { clearSandboxModuleCache } from "../sandboxModuleCatalog";
import type { WorkflowGraph } from "../../../stores/ApiTypes";
import type { TraceRecord } from "@nodetool-ai/protocol";
import { BrowserRunTrace } from "../../browserRunTrace";

const browserGraph = (type: string): WorkflowGraph =>
  stub<WorkflowGraph>({
    nodes: [{ id: "n1", type, data: { value: "x" } }],
    edges: []
  });

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

describe("reportBrowserEligibility", () => {
  it("is true when every node type is in the browser registry", async () => {
    installFakeRunner(completed());
    expect(
      (await reportBrowserEligibility(browserGraph("browser.Const"))).eligible
    ).toBe(true);
  });

  it("is false when a node type is unknown to the browser registry", async () => {
    installFakeRunner(completed());
    expect(
      (await reportBrowserEligibility(browserGraph("server.Image"))).eligible
    ).toBe(false);
  });

  it("is false for an empty graph", async () => {
    installFakeRunner(completed());
    expect(
      (await reportBrowserEligibility({ nodes: [], edges: [] } as WorkflowGraph))
        .eligible
    ).toBe(false);
  });

  it("is false (no throw) when the browser runner can't be loaded", async () => {
    __setBrowserRunnerLoader(async () => null);
    expect(
      (await reportBrowserEligibility(browserGraph("browser.Const"))).eligible
    ).toBe(false);
  });

  it("retries after a transient load failure instead of caching it", async () => {
    let calls = 0;
    __setBrowserRunnerLoader(async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("transient chunk load failure");
      }
      return {
        wf: {
          createBrowserRegistry: () => fakeRegistry,
          runBrowserWorkflow: (() => undefined) as never
        } as never,
        nodeClasses: []
      };
    });

    // First attempt throws → false, but the failure is not cached.
    expect(
      (await reportBrowserEligibility(browserGraph("browser.Const"))).eligible
    ).toBe(false);
    // A later attempt retries the load and succeeds.
    expect(
      (await reportBrowserEligibility(browserGraph("browser.Const"))).eligible
    ).toBe(true);
    expect(calls).toBe(2);
  });

  it("does not load the heavy runner in a unit-test process by default", async () => {
    __setBrowserRunnerLoader(null);
    expect(
      (await reportBrowserEligibility(browserGraph("browser.Const"))).eligible
    ).toBe(false);
  });
});

describe("canRunGraphInBrowserSync", () => {
  it("is false while cold (and warms), true once the runner is loaded", async () => {
    installFakeRunner(completed());

    // Cold cache: returns false synchronously, schedules a background warm.
    expect(canRunGraphInBrowserSync(browserGraph("browser.Const"))).toBe(false);

    // Force the load to settle, then the sync decision reflects the registry.
    await reportBrowserEligibility(browserGraph("browser.Const"));

    expect(canRunGraphInBrowserSync(browserGraph("browser.Const"))).toBe(true);
    expect(canRunGraphInBrowserSync(browserGraph("server.Image"))).toBe(false);
  });
});

describe("sandbox package prefetch", () => {
  /** A registry that also knows the Code node, so only its imports decide. */
  const codeRegistry = {
    has: (type: string) =>
      type.startsWith("browser.") || type === "nodetool.code.Code"
  };

  function installCodeRunner(
    onRun?: (opts: Record<string, unknown>) => void
  ): void {
    __setBrowserRunnerLoader(async () => ({
      wf: {
        createBrowserRegistry: () => codeRegistry,
        runBrowserWorkflow: (opts: Record<string, unknown>) => {
          onRun?.(opts);
          return completed()();
        }
      } as never,
      nodeClasses: []
    }));
  }

  const codeGraph = (imports: string[]): WorkflowGraph =>
    stub<WorkflowGraph>({
      nodes: [
        {
          id: "code_1",
          type: "nodetool.code.Code",
          data: {
            properties: {
              code:
                imports
                  .map((specifier) => `import * as m from "${specifier}";\n`)
                  .join("") + "return {};"
            }
          }
        }
      ],
      edges: []
    });

  const DIGEST = "a".repeat(64);

  /** SHA-256 of `body`, hex — what the route announces and the client checks. */
  async function sha(body: string): Promise<string> {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body)
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  /** The members of `Response` the catalog reads — jsdom has no Fetch classes. */
  function fakeResponse(
    status: number,
    body: string,
    headers: Record<string, string> = {}
  ): Response {
    const lookup = new Map(
      Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
    );
    return stub<Response>({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => lookup.get(name.toLowerCase()) ?? null },
      arrayBuffer: async () => new TextEncoder().encode(body).buffer
    });
  }

  async function moduleResponse(
    source: string,
    overrides: Record<string, string> = {}
  ): Promise<Response> {
    return fakeResponse(200, source, {
      "Content-Type": "text/javascript",
      "X-Content-Digest": DIGEST,
      "X-Content-Sha256": await sha(source),
      "X-Sandbox-Pack": "@acme/nodetool-geo",
      "X-Sandbox-File-Id": "sandbox/geo.js",
      "X-Sandbox-Internal": "0",
      "X-Sandbox-Module-Dependencies": "[]",
      ...overrides
    });
  }

  /** jsdom has no `fetch`, so install one rather than spy on a missing global. */
  function installFetch(
    impl: (input: unknown) => Promise<Response>
  ): jest.Mock<Promise<Response>, [unknown]> {
    const mock = jest.fn(impl) as jest.Mock<Promise<Response>, [unknown]>;
    (globalThis as { fetch?: unknown }).fetch = mock;
    return mock;
  }

  beforeEach(() => {
    clearSandboxModuleCache();
  });

  afterEach(() => {
    delete (globalThis as { fetch?: unknown }).fetch;
  });

  it("stays eligible whether or not the Code node imports a pack", async () => {
    installCodeRunner();
    expect((await reportBrowserEligibility(codeGraph([]))).eligible).toBe(true);
    expect(
      (await reportBrowserEligibility(codeGraph(["@acme/geo"]))).eligible
    ).toBe(true);
    expect(canRunGraphInBrowserSync(codeGraph(["@acme/geo"]))).toBe(true);
  });

  it("fetches the declared modules and hands the run a warmed catalog", async () => {
    const source = "export const label = () => 'geo';\n";
    const fetchMock = installFetch(async () => moduleResponse(source));
    let captured: Record<string, unknown> | undefined;
    installCodeRunner((opts) => {
      captured = opts;
    });

    const result = await runBrowserGraphJob({
      graph: codeGraph(["@acme/geo"]),
      workflowId: "wf-pkg"
    });

    expect(result.success).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/api/sandbox-modules/%40acme%2Fgeo"
    );
    const catalog = captured?.sandboxModuleCatalog as {
      resolveForExecution: (
        d: Array<{ specifier: string }>
      ) => { modules: Array<{ specifier: string; source?: string }> };
    };
    expect(catalog.resolveForExecution([{ specifier: "@acme/geo" }]).modules[0])
      .toMatchObject({ specifier: "@acme/geo", source });
  });

  it("passes no catalog when the graph declares nothing", async () => {
    const fetchMock = installFetch(async () => {
      throw new Error("no module should be fetched");
    });
    let captured: Record<string, unknown> | undefined;
    installCodeRunner((opts) => {
      captured = opts;
    });

    await runBrowserGraphJob({ graph: codeGraph([]), workflowId: "wf-none" });

    expect(captured?.sandboxModuleCatalog).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails the job when a declared module is not on this server", async () => {
    installFetch(async () => fakeResponse(404, ""));
    installCodeRunner();

    const result = await runBrowserGraphJob({
      graph: codeGraph(["@acme/geo"]),
      workflowId: "wf-404"
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("@acme/geo");
    expect(result.error).toContain("not available on this server");
  });

  it("fails the job when a delivered body fails its content check", async () => {
    installFetch(async () =>
      moduleResponse("export const label = () => 'geo';\n", {
        "X-Content-Sha256": "b".repeat(64)
      })
    );
    installCodeRunner();

    const result = await runBrowserGraphJob({
      graph: codeGraph(["@acme/geo"]),
      workflowId: "wf-sha"
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("failed its content check");
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

  it("stamps arrival-order index per (job, node) on generation_complete and normalizes outputs", async () => {
    const deliver = jest.spyOn(globalWebSocketManager, "deliverLocal");
    installFakeRunner(
      makeGen(
        [
          {
            type: "generation_complete",
            node_id: "gen",
            node_name: "gen",
            node_type: "browser.Gen",
            outputs: { image: "a" }
          },
          {
            type: "generation_complete",
            node_id: "gen",
            node_name: "gen",
            node_type: "browser.Gen",
            outputs: { image: "b" }
          },
          {
            type: "generation_complete",
            node_id: "gen",
            node_name: "gen",
            node_type: "browser.Gen",
            outputs: { image: "c" }
          },
          {
            // A different node restarts the per-node counter at 0.
            type: "generation_complete",
            node_id: "other",
            node_name: "other",
            node_type: "browser.Gen",
            outputs: { image: "z" }
          }
        ],
        { status: "completed" }
      )
    );

    const result = await runBrowserGraphJob({
      graph: browserGraph("browser.Gen"),
      workflowId: "wf-gc"
    });
    expect(result.success).toBe(true);

    const gens = deliver.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((m) => m.type === "generation_complete");
    expect(gens).toHaveLength(4);

    const forGen = gens.filter((m) => m.node_id === "gen");
    expect(forGen.map((m) => m.index)).toEqual([0, 1, 2]);
    // outputs preserved through materialize (plain values pass through).
    expect(forGen.map((m) => (m.outputs as Record<string, unknown>).image)).toEqual([
      "a",
      "b",
      "c"
    ]);

    const forOther = gens.filter((m) => m.node_id === "other");
    expect(forOther.map((m) => m.index)).toEqual([0]);
  });
});

describe("collectNodeClasses", () => {
  class IndividualNode {
    static nodeType = "test.Individual";
  }
  class GroupedA {
    static nodeType = "test.GroupedA";
  }
  class GroupedB {
    static nodeType = "test.GroupedB";
  }

  it("collects individually-exported classes (core-nodes shape)", () => {
    const types = collectNodeClasses({ IndividualNode }).map(
      (c) => (c as { nodeType: string }).nodeType
    );
    expect(types).toEqual(["test.Individual"]);
  });

  it("collects classes from an exported array constant (image-nodes shape)", () => {
    // Image GPU groups export only `LIB_IMAGE_*_NODES = [...]`, never named
    // classes — these must still be harvested or they never reach the registry.
    const types = collectNodeClasses({
      LIB_TEST_NODES: [GroupedA, GroupedB]
    }).map((c) => (c as { nodeType: string }).nodeType);
    expect(types).toEqual(["test.GroupedA", "test.GroupedB"]);
  });

  it("dedupes a class exported both individually and inside an array", () => {
    const classes = collectNodeClasses({
      IndividualNode,
      NODES: [IndividualNode]
    });
    expect(classes).toHaveLength(1);
  });

  it("ignores non-class exports and non-class array items", () => {
    const types = collectNodeClasses({
      helper: () => 1,
      DESCRIPTORS: [{ id: "x" }, "str", 3],
      GroupedA
    }).map((c) => (c as { nodeType: string }).nodeType);
    expect(types).toEqual(["test.GroupedA"]);
  });
});

describe("browser app trace transport", () => {
  function traceFixture(runId = "a".repeat(32), traceId = "b".repeat(32)) {
    const records: TraceRecord[] = [];
    const trace = new BrowserRunTrace({
      runId, traceId, operationId: "main", instanceId: "c".repeat(32),
      send: async (_id, batch) => { records.push(...batch); }
    });
    return { trace, records };
  }

  it("records actual routed node lifecycles below a workflow span and the reserved server root", async () => {
    const { trace, records } = traceFixture();
    const serverRootSpanId = "d".repeat(16);
    const jobId = "e".repeat(32);
    installFakeRunner(makeGen([
      { type: "node_update", job_id: jobId, node_id: "n1", status: "running" },
      { type: "node_update", job_id: jobId, node_id: "n1", status: "completed", result: { output: "owner value" } }
    ], { status: "completed" }));
    const result = await runBrowserGraphJob({
      graph: browserGraph("browser.Const"), workflowId: "workflow", jobId,
      trace, traceParentSpanId: serverRootSpanId
    });
    await trace.finish();
    const workflowSpan = records.find((record) => record.name === "workflow.run");
    const node = records.find((record) => record.name === "node.process");
    expect(result).toMatchObject({ success: true, outputs: { n1: { output: "owner value" } } });
    expect(workflowSpan).toMatchObject({ parent_span_id: serverRootSpanId, status: { code: "OK" } });
    expect(node).toMatchObject({ parent_span_id: workflowSpan?.span_id, attributes: { "node.id": "n1", "node.type": "browser.Const" }, status: { code: "OK" } });
    expect(records.filter((record) => record.name === "node.process")).toHaveLength(1);
    expect(records.every((record) => record.trace_id === "b".repeat(32) && record.resource["nodetool.trace.source"] === "browser")).toBe(true);
    trace.dispose();
  });

  it("ends unfinished nodes on a kernel failure and unsubscribes the real message route", async () => {
    const { trace, records } = traceFixture();
    const jobId = "f".repeat(32);
    const originalSubscribe = globalWebSocketManager.subscribe.bind(globalWebSocketManager);
    const cleanup = jest.fn();
    jest.spyOn(globalWebSocketManager, "subscribe").mockImplementation((key, handler) => {
      const unsubscribe = originalSubscribe(key, handler);
      return () => { cleanup(); unsubscribe(); };
    });
    installFakeRunner(async function* () {
      yield { type: "node_update", job_id: jobId, node_id: "n1", status: "running" };
      throw new Error("Kernel crashed");
    });
    const result = await runBrowserGraphJob({
      graph: browserGraph("browser.Const"), workflowId: "workflow", jobId, trace
    });
    expect(result).toMatchObject({ success: false, error: "Kernel crashed" });
    expect(cleanup).toHaveBeenCalledTimes(1);
    globalWebSocketManager.deliverLocal({ type: "node_update", job_id: jobId, node_id: "after-cleanup", status: "running" });
    await trace.finish(new Error("Kernel crashed"));
    expect(records.filter((record) => record.name === "node.process")).toEqual([
      expect.objectContaining({ attributes: { "node.id": "n1", "node.type": "browser.Const", "error.type": "Error" }, status: { code: "ERROR", message: "Kernel crashed" } })
    ]);
    expect(records.find((record) => record.name === "workflow.run")?.status.code).toBe("ERROR");
    trace.dispose();
  });

  it("keeps overlapping same-workflow/node jobs on their invocation-local trace and parent", async () => {
    const a = traceFixture("1".repeat(32), "2".repeat(32));
    const b = traceFixture("3".repeat(32), "4".repeat(32));
    const firstJob = "5".repeat(32), secondJob = "6".repeat(32);
    let startFirst = () => {};
    let startSecond = () => {};
    let finishFirst = () => {};
    let finishSecond = () => {};
    const startedFirst = new Promise<void>((resolve) => { startFirst = resolve; });
    const startedSecond = new Promise<void>((resolve) => { startSecond = resolve; });
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve; });
    const secondGate = new Promise<void>((resolve) => { finishSecond = resolve; });
    __setBrowserRunnerLoader(async () => ({
      wf: {
        createBrowserRegistry: () => fakeRegistry,
        runBrowserWorkflow: (opts: Record<string, unknown>) => (async function* () {
          const ownJob = opts.jobId;
          yield { type: "node_update", job_id: ownJob, workflow_id: "same-workflow", node_id: "n1", status: "running" };
          if (ownJob === firstJob) { startFirst(); await firstGate; }
          else { startSecond(); await secondGate; }
          yield { type: "node_update", job_id: ownJob, workflow_id: "same-workflow", node_id: "n1", status: "completed", result: { output: ownJob } };
          return { status: "completed", outputs: {} };
        })()
      } as never, nodeClasses: []
    }));
    const first = runBrowserGraphJob({ graph: browserGraph("browser.Const"), workflowId: "same-workflow", jobId: firstJob, trace: a.trace, traceParentSpanId: "7".repeat(16) });
    const second = runBrowserGraphJob({ graph: browserGraph("browser.Const"), workflowId: "same-workflow", jobId: secondJob, trace: b.trace, traceParentSpanId: "8".repeat(16) });
    await Promise.all([startedFirst, startedSecond]);
    finishSecond();
    expect(await second).toMatchObject({ success: true, outputs: { n1: { output: secondJob } } });
    await b.trace.finish();
    finishFirst();
    expect(await first).toMatchObject({ success: true, outputs: { n1: { output: firstJob } } });
    await a.trace.finish();
    for (const [fixture, expectedTrace, parent] of [[a, "2".repeat(32), "7".repeat(16)], [b, "4".repeat(32), "8".repeat(16)]] as const) {
      const workflow = fixture.records.find((record) => record.name === "workflow.run");
      expect(fixture.records.filter((record) => record.name === "node.process")).toHaveLength(1);
      expect(workflow?.parent_span_id).toBe(parent);
      expect(fixture.records.find((record) => record.name === "node.process")?.parent_span_id).toBe(workflow?.span_id);
      expect(fixture.records.every((record) => record.trace_id === expectedTrace)).toBe(true);
      fixture.trace.dispose();
    }
  });
});
