/**
 * The kernel runner every server-side app simulation uses.
 *
 * `simulateApp` has exactly one contract with a kernel:
 * `AppServerRunInput → AppServerRunOutcome`. This builds that closure — one
 * `ExecutionSession` per run, over the graph the caller holds in memory,
 * persisting nothing. A build's workflows have no rows until its bundle is
 * imported, and a debugged draft may have none at all, so neither surface can
 * run through the job machinery.
 *
 * Shared by the app build service (the Run stage) and the app debug service
 * (`POST /api/applications/debug`), so a run means the same thing to both.
 */

import { randomUUID } from "node:crypto";
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { ExecutionSession } from "../session.js";
import { collectExecutionSummary } from "../debug/collector.js";
import type {
  AppServerRunInput,
  AppServerRunOutcome
} from "../app-debug/index.js";
import { getSecret } from "@nodetool-ai/models";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { FileStorageAdapter, ProcessingContext } from "@nodetool-ai/runtime";

export interface AppServerRunnerOptions {
  /** Job-id prefix, so a run is attributable to the surface that started it. */
  jobPrefix?: string;
}

export function createAppServerRunner(
  userId: string,
  registry: NodeRegistry,
  options: AppServerRunnerOptions = {}
): (input: AppServerRunInput) => Promise<AppServerRunOutcome> {
  const jobPrefix = options.jobPrefix ?? "app-run";
  return async (input) => {
    const startedAt = Date.now();
    const jobId = `${jobPrefix}-${randomUUID()}`;
    const context = new ProcessingContext({
      jobId,
      workflowId: input.workflowId,
      userId,
      secretResolver: (key: string) => getSecret(key, userId),
      storage: new FileStorageAdapter(getDefaultAssetsPath())
    });
    const sessionOptions: Parameters<typeof ExecutionSession.create>[0] = {
      graph: input.graph,
      registry,
      jobId,
      workflowId: input.workflowId,
      params: input.params,
      context
    };
    if (input.timeoutMs !== undefined) {
      sessionOptions.limits = { runTimeoutMs: input.timeoutMs };
    }
    const session = await ExecutionSession.create(sessionOptions);
    // `session.result` never rejects: a kernel failure resolves as
    // `status: "failed"`, which the simulator turns into a complaint.
    const result = await session.result;
    const messages = result.messages ?? [];
    const summary = collectExecutionSummary(messages);
    summary.status = result.status ?? summary.status;
    const timedOut = session.cancelReason === "timeout";
    const error =
      result.error ??
      (timedOut ? `run exceeded timeout (${input.timeoutMs}ms)` : undefined);
    if (error && !summary.error) summary.error = error;
    return {
      report: {
        surface: "server",
        ok: result.status === "completed",
        status: result.status ?? summary.status,
        error: error ?? summary.error ?? null,
        durationMs: Date.now() - startedAt,
        summary,
        trace: null
      },
      rawMessages: messages
    };
  };
}
