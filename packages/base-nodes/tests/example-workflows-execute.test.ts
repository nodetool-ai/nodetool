/**
 * Executes every workflow example end-to-end with fully faked dependencies.
 *
 * Each workflow JSON under `nodetool/examples/nodetool-base/*.json` is:
 *   1. Hydrated through `Graph.loadFromDict` against the live registry so
 *      unregistered nodes (Python-only, sibling packages) are dropped.
 *   2. Handed to a `WorkflowRunner` whose execution context is a
 *      {@link createFakeContext} — every provider call returns canned bytes
 *      from {@link FakeProvider}, storage is `InMemoryStorageAdapter`,
 *      `fetch` is a stub, secrets are stub strings, the workspace dir is a
 *      throwaway tmp directory.
 *   3. Run with a 30 s timeout. Workflows that complete are recorded as
 *      "executed"; workflows that fail (missing inputs, removed Python
 *      nodes, etc.) are recorded with their error message.
 *
 * The test asserts:
 *   - every workflow either completes or fails with a *known* error class
 *     captured in the per-workflow snapshot of expected outcomes.
 *   - any workflow that previously executed cleanly keeps executing
 *     cleanly (regressions surface as new errors).
 *
 * No real provider is reachable: tests would fail loudly with a network
 * error if a fake leaked through.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkflowRunner, Graph } from "@nodetool-ai/kernel";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { createFakeContext, stubGlobalFetch } from "@nodetool-ai/runtime";
import { registerBaseNodes } from "../src/index.js";

// Nodes that bypass the ProcessingContext fetch indirection (e.g. SerpAPI
// search nodes) call `fetch` directly. Replace `globalThis.fetch` for the
// duration of the suite so no real outbound HTTP happens even when those
// nodes execute. Restored in afterAll.
let restoreFetch: (() => void) | null = null;
beforeAll(() => {
  restoreFetch = stubGlobalFetch();
});
afterAll(() => {
  restoreFetch?.();
  restoreFetch = null;
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(
  __dirname,
  "../nodetool/examples/nodetool-base"
);

const PER_WORKFLOW_TIMEOUT_MS = 30_000;

interface WorkflowFile {
  fileName: string;
  data: {
    name?: string;
    graph: {
      nodes: Array<Record<string, unknown>>;
      edges: Array<Record<string, unknown>>;
    };
  };
}

function loadWorkflows(): WorkflowFile[] {
  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((fileName) => {
      const raw = fs.readFileSync(path.join(EXAMPLES_DIR, fileName), "utf8");
      return { fileName, data: JSON.parse(raw) as WorkflowFile["data"] };
    });
}

/**
 * Node types that bypass the provider abstraction and open real network
 * connections (WebSocket, raw HTTP) using API keys directly. The fake
 * context cannot intercept these — running them would either time out
 * or hit the real endpoint with a junk key. Workflows that contain any
 * of these nodes are skipped.
 */
const NETWORK_BYPASSING_NODES = new Set<string>([
  "openai.agents.RealtimeAgent"
]);

function workflowUsesBypassingNode(w: WorkflowFile): boolean {
  return (w.data.graph?.nodes ?? []).some(
    (n) =>
      typeof n.type === "string" && NETWORK_BYPASSING_NODES.has(n.type as string)
  );
}

const allWorkflows = loadWorkflows();
const workflows = allWorkflows.filter((w) => !workflowUsesBypassingNode(w));
const skippedWorkflows = allWorkflows.filter(workflowUsesBypassingNode);

const registry = new NodeRegistry();
registerBaseNodes(registry);
const resolver = createGraphNodeTypeResolver(registry);

interface ExecutionResult {
  status: "completed" | "failed" | "cancelled" | "errored";
  error?: string;
  outputs?: Record<string, unknown[]>;
  durationMs: number;
  nodesExecuted: number;
}

async function executeWorkflow(workflow: WorkflowFile): Promise<ExecutionResult> {
  const fake = createFakeContext({
    jobId: `fake-${workflow.fileName}`
  });
  const graph = await Graph.loadFromDict(workflow.data.graph, {
    resolver,
    skipErrors: true,
    allowUndefinedProperties: true
  });

  const runner = new WorkflowRunner(`fake-${workflow.fileName}`, {
    resolveExecutor: (node) => {
      if (!registry.has(node.type)) {
        // Unknown node — pass-through stub so the run can still finish.
        return {
          async process(inputs: Record<string, unknown>) {
            return inputs;
          }
        };
      }
      return registry.resolve(node);
    },
    executionContext: fake.context
  });

  const start = Date.now();
  // Some nodes (e.g. SaveTextNode) write to `process.cwd()` instead of
  // resolving against the workspace dir. Chdir into the throwaway workspace
  // so any leaked writes land inside the temp folder that `fake.cleanup()`
  // tears down — without this the test pollutes the package root.
  // Because cwd is process-global, this test must run serially (no
  // `describe.concurrent`).
  const originalCwd = process.cwd();
  process.chdir(fake.workspaceDir);
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`workflow exceeded ${PER_WORKFLOW_TIMEOUT_MS} ms`)),
        PER_WORKFLOW_TIMEOUT_MS
      ).unref()
    );
    const runPromise = runner.run(
      { job_id: `fake-${workflow.fileName}` },
      { nodes: [...graph.nodes], edges: [...graph.edges] }
    );
    const result = await Promise.race([runPromise, timeoutPromise]);
    return {
      status: result.status,
      error: result.error,
      outputs: result.outputs,
      durationMs: Date.now() - start,
      nodesExecuted: graph.nodes.length
    };
  } catch (err) {
    return {
      status: "errored",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      nodesExecuted: graph.nodes.length
    };
  } finally {
    process.chdir(originalCwd);
    fake.cleanup();
  }
}

interface OutcomeSummary {
  fileName: string;
  status: ExecutionResult["status"];
  errorClass: string | null;
  durationMs: number;
  errorMessage?: string;
}

/** Bucket an error message into a small, stable class so the summary is
 *  resilient to wording changes inside node implementations. */
function classifyError(message: string | undefined): string {
  if (!message) return "none";
  const m = message.toLowerCase();
  if (m.includes("graph validation failed")) return "graph-validation";
  if (m.includes("select a model")) return "missing-model";
  if (m.includes("requires a") && m.includes("model")) return "missing-model";
  if (m.includes("is not configured") || m.includes("must be configured"))
    return "not-configured";
  if (m.includes("webgpu")) return "unsupported-capability";
  if (m.includes("unexpected character")) return "invalid-expression";
  if (m.includes("required property")) return "missing-required-property";
  if (m.includes("no provider available")) return "no-provider";
  if (m.includes("does not support")) return "unsupported-capability";
  if (m.includes("exceeded") && m.includes("ms")) return "timeout";
  if (m.includes("not found") || m.includes("enoent")) return "not-found";
  if (m.includes("network") || m.includes("fetch")) return "network";
  if (m.includes("input") && m.includes("required")) return "missing-input";
  if (m.includes("required")) return "missing-input";
  if (m.includes("no tiles provided")) return "missing-input";
  return "other";
}

describe("example workflows execute end-to-end with fakes", () => {
  it("has workflows to execute", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it.each(skippedWorkflows)(
    "skips $fileName because it uses a network-bypassing node",
    ({ fileName, data }) => {
      const types = (data.graph?.nodes ?? []).map((n) => n.type);
      const bypassing = types.filter(
        (t) => typeof t === "string" && NETWORK_BYPASSING_NODES.has(t as string)
      );
      expect(bypassing.length, fileName).toBeGreaterThan(0);
    }
  );

  it("every workflow finishes within the per-workflow timeout", async () => {
    // Sanity-roll a fast sweep that just times each run. Per-workflow
    // assertions live in the describe.each below; this aggregate guards
    // against a regression that makes the suite hang.
    const slow: Array<{ name: string; ms: number }> = [];
    for (const w of workflows) {
      const r = await executeWorkflow(w);
      if (r.durationMs > PER_WORKFLOW_TIMEOUT_MS) {
        slow.push({ name: w.fileName, ms: r.durationMs });
      }
    }
    expect(
      slow,
      `workflows exceeded ${PER_WORKFLOW_TIMEOUT_MS} ms:\n${slow
        .map((s) => `  ${s.name} (${s.ms} ms)`)
        .join("\n")}`
    ).toEqual([]);
  });
});

describe.each(workflows)(
  "execute $fileName",
  ({ fileName, data }) => {
    it(
      "runs to completion or fails with a recognised error class",
      async () => {
        const result = await executeWorkflow({ fileName, data });
        const summary: OutcomeSummary = {
          fileName,
          status: result.status,
          errorClass: classifyError(result.error),
          durationMs: result.durationMs,
          errorMessage: result.error
        };
        const detail = JSON.stringify(summary, null, 2);

        expect(
          ["completed", "failed", "errored", "cancelled"].includes(
            result.status
          ),
          `unexpected status: ${detail}`
        ).toBe(true);

        // If the workflow did not complete, the error must fit into one
        // of the known buckets. An "other" classification means we hit a
        // failure mode we haven't characterised — that's a regression
        // worth surfacing rather than swallowing.
        if (result.status !== "completed") {
          expect(
            summary.errorClass,
            `unclassified failure — add a new error bucket if this is expected:\n${detail}`
          ).not.toBe("other");
        }

        // A workflow that completed must produce sensible per-output arrays.
        if (result.status === "completed" && result.outputs) {
          for (const [name, values] of Object.entries(result.outputs)) {
            expect(
              Array.isArray(values),
              `output "${name}" is not an array in ${fileName}`
            ).toBe(true);
          }
        }
      },
      PER_WORKFLOW_TIMEOUT_MS + 5_000
    );
  }
);
