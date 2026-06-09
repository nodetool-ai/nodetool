/**
 * runWorkflow — execute a graph against a NodeRegistry and yield messages live.
 *
 * This is the portable core: no fs, no subprocess, no transport assumptions.
 * The caller supplies the graph, the registry, and (optionally) a context.
 * Everything platform-specific (storage backend, secret resolution, etc.)
 * is injected via the context.
 */

import {
  WorkflowRunner,
  type NodeValidator,
  type RunJobRequest,
  type RunResult
} from "@nodetool-ai/kernel";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
// Narrow `/context` subpath (not the package root) so the browser bundle of
// this runner doesn't pull the provider / python-bridge barrel.
import {
  ProcessingContext,
  type CacheAdapter,
  type StorageAdapter
} from "@nodetool-ai/runtime/context";
import type {
  Edge,
  NodeDescriptor,
  Platform,
  ProcessingMessage
} from "@nodetool-ai/protocol";

export type GraphData = {
  nodes: NodeDescriptor[];
  edges: Edge[];
};

export interface RunWorkflowOptions {
  graph: GraphData;
  registry: NodeRegistry;
  params?: Record<string, unknown>;
  jobId?: string;
  workflowId?: string;

  /** Pre-built context. If omitted, a minimal one is created from the fields below. */
  context?: ProcessingContext;

  /** Optional context inputs (ignored when `context` is provided). */
  storage?: StorageAdapter | null;
  workspaceStorage?: StorageAdapter | null;
  cache?: CacheAdapter;
  environment?: Record<string, string>;
  secretResolver?: (
    key: string,
    userId: string
  ) => Promise<string | null | undefined> | string | null | undefined;

  /** Abort the run when this signal fires. */
  signal?: AbortSignal;

  /**
   * Reject graphs whose nodes do not declare support for this deployment
   * platform. When set, the runner runs both property validation and
   * platform validation as a pre-flight; unsupported nodes cause the run
   * to fail before any actor is spawned.
   */
  platform?: Platform;
}

/**
 * Execute a workflow and stream ProcessingMessages as they are emitted.
 *
 * Yields each message live; the final `RunResult` is the generator's return value.
 *
 * ```ts
 * for await (const msg of runWorkflow(opts)) { ... }
 * ```
 */
export async function* runWorkflow(
  opts: RunWorkflowOptions
): AsyncGenerator<ProcessingMessage, RunResult, void> {
  const jobId = opts.jobId ?? generateJobId();
  if (opts.signal?.aborted) {
    const message: ProcessingMessage = {
      type: "job_update",
      status: "cancelled",
      job_id: jobId,
      workflow_id: opts.workflowId ?? null
    };
    return { outputs: {}, messages: [message], status: "cancelled" };
  }

  const context =
    opts.context ??
    new ProcessingContext({
      jobId,
      workflowId: opts.workflowId ?? null,
      storage: opts.storage ?? null,
      workspaceStorage: opts.workspaceStorage ?? null,
      cache: opts.cache,
      environment: opts.environment,
      secretResolver: opts.secretResolver
    });

  const runner = new WorkflowRunner(jobId, {
    resolveExecutor: (node) => opts.registry.resolve(node),
    executionContext: context,
    validateNode: composeValidators(
      opts.registry.createNodeValidator(),
      opts.platform
        ? opts.registry.createPlatformValidator(opts.platform)
        : null
    )
  });

  const queue: ProcessingMessage[] = [];
  let wake: (() => void) | null = null;
  const wakeQueue = (): void => {
    const w = wake;
    wake = null;
    w?.();
  };
  const unsubscribe = context.addMessageListener((message) => {
    queue.push(message);
    wakeQueue();
  });

  const request: RunJobRequest = {
    job_id: jobId,
    workflow_id: opts.workflowId,
    params: opts.params
  };

  let finished = false;
  let runError: unknown = null;
  let result: RunResult | null = null;

  const runPromise = runner
    .run(request, opts.graph)
    .then((r) => {
      result = r;
    })
    .catch((err) => {
      runError = err;
    })
    .finally(() => {
      finished = true;
      wakeQueue();
    });

  let cancelRequested = false;
  const cancelRun = (): void => {
    if (cancelRequested) {
      wakeQueue();
      return;
    }
    cancelRequested = true;
    if (!finished) {
      runner.cancel();
    }
    wakeQueue();
  };
  opts.signal?.addEventListener("abort", cancelRun, { once: true });

  try {
    while (!finished || queue.length > 0) {
      if (queue.length === 0) {
        if (opts.signal?.aborted) {
          cancelRun();
          break;
        }
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const msg = queue.shift()!;
      yield msg;
    }
    await runPromise;
  } finally {
    opts.signal?.removeEventListener("abort", cancelRun);
    unsubscribe();
  }

  if (runError) throw runError;
  if (!result) {
    throw new Error("Workflow runner exited without a result");
  }
  return result;
}

function composeValidators(
  a: NodeValidator,
  b: NodeValidator | null
): NodeValidator {
  if (!b) return a;
  return (descriptor, connectedHandles) => {
    const aIssues = a(descriptor, connectedHandles) ?? [];
    const bIssues = b(descriptor, connectedHandles) ?? [];
    if (aIssues.length === 0) return bIssues;
    if (bIssues.length === 0) return aIssues;
    return [...aIssues, ...bIssues];
  };
}

function generateJobId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
