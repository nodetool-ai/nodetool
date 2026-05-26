/**
 * Browser entry point for the workflow-runner E2E suite.
 *
 * Proves NodeTool's **kernel** executes a graph end to end inside a
 * real (headless) browser. Imports ONLY `@nodetool-ai/kernel` — which
 * has no static `node:fs/promises` / `node:os` deps — and constructs
 * the executors as plain `NodeExecutor` objects. This sidesteps the
 * `@nodetool-ai/node-sdk` and `@nodetool-ai/runtime` packages whose
 * dist files still statically import `node:fs/promises` (gated by
 * runtime checks but parsed at module load).
 *
 * If this passes, WorkflowRunner's actor model — inbox routing,
 * validator dispatch, ProcessingMessage emission — works in a V8
 * isolate with no Node APIs.
 */

import { WorkflowRunner, type NodeExecutor } from "@nodetool-ai/kernel";
import type {
  Edge,
  NodeDescriptor,
  ProcessingMessage,
  RunResult
} from "@nodetool-ai/protocol";

// ── Inline NodeExecutor map (plain objects, no BaseNode) ───────────────

const executors: Record<
  string,
  (descriptor: NodeDescriptor) => NodeExecutor
> = {
  "browsertest.ConstantText": (d) => ({
    async process() {
      const props = (d.properties as { value?: string }) ?? {};
      return { output: String(props.value ?? "") };
    }
  }),
  "browsertest.Uppercase": () => ({
    async process(inputs) {
      return { output: String(inputs.text ?? "").toUpperCase() };
    }
  }),
  "browsertest.Concat": () => ({
    async process(inputs) {
      return { output: `${inputs.a ?? ""}${inputs.b ?? ""}` };
    }
  })
};

// ── Harness API exposed to Playwright ───────────────────────────────────

interface GraphData {
  nodes: NodeDescriptor[];
  edges: Edge[];
}

interface BrowserRunResult {
  status: RunResult["status"];
  outputs: Record<string, unknown[]>;
  messageTypes: string[];
  error?: string;
}

declare global {
  interface Window {
    runWorkflowInBrowser: (
      graph: GraphData,
      params?: Record<string, unknown>
    ) => Promise<BrowserRunResult>;
    runtimeName: string;
  }
}

window.runtimeName =
  typeof navigator !== "undefined" ? navigator.userAgent : "unknown";

window.runWorkflowInBrowser = async (
  graph: GraphData,
  params: Record<string, unknown> = {}
): Promise<BrowserRunResult> => {
  const jobId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `job_${Date.now()}`;

  const passthrough: NodeExecutor = {
    async process(inputs) {
      return inputs;
    }
  };

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node) => {
      const factory = executors[node.type];
      return factory ? factory(node) : passthrough;
    }
  });

  const result = await runner.run({ job_id: jobId, params }, graph);
  const messageTypes: string[] = [];
  for (const m of result.messages as ProcessingMessage[]) {
    messageTypes.push(m.type);
  }
  return {
    status: result.status,
    outputs: result.outputs,
    messageTypes,
    error: result.error
  };
};

(window as unknown as { workflowRunnerReady: boolean }).workflowRunnerReady =
  true;
