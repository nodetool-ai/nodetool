/**
 * createWorkflowHandler — a (Request) => Response handler that runs a workflow
 * and streams messages as Server-Sent Events.
 *
 * Works on Vercel (Node + Edge), Cloudflare Workers, Bun, Deno — anywhere
 * Web standard `Request`/`Response`/`ReadableStream` are available.
 *
 * Request body (JSON):
 *   {
 *     "graph":       { "nodes": [...], "edges": [...] },
 *     "params":      { ... },         // optional, keyed by input-node name
 *     "workflow_id": "...",            // optional
 *     "job_id":      "..."             // optional
 *   }
 *
 * Response: text/event-stream
 *   data: { ...ProcessingMessage }
 *   ...
 *   event: result
 *   data: { ...RunResult }
 *
 * Note: request parse/validation errors are returned as JSON (4xx). Once
 * the SSE Response is created, workflow failures are reported as an SSE
 * `error` event (HTTP 200).
 */

import type { Platform, ProcessingMessage } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { runWorkflow, type GraphData, type RunWorkflowOptions } from "./run.js";

export interface CreateWorkflowHandlerOptions {
  /** NodeRegistry pre-populated with the nodes available in this deployment. */
  registry: NodeRegistry;

  /**
   * Optional per-request context factory. Receives the incoming Request so
   * the caller can wire env-specific bindings (R2/S3 client, secrets, etc.).
   * Returning `void` falls back to a minimal in-memory context.
   */
  createContext?: (
    req: Request
  ) =>
    | ProcessingContext
    | Promise<ProcessingContext>
    | void
    | Promise<void>;

  /**
   * Optional hook to transform / authorize the parsed request body before
   * execution. Throw to abort with a 4xx; return a body to use it.
   */
  beforeRun?: (
    body: WorkflowRequestBody,
    req: Request
  ) => WorkflowRequestBody | Promise<WorkflowRequestBody>;

  /**
   * Deployment platform this handler serves. When set, the runner rejects
   * graphs containing nodes that do not declare support for this platform.
   * The registry passed in should normally have been filtered with
   * `registry.forPlatform(platform)` for matching bundle / runtime semantics.
   */
  platform?: Platform;
}

export interface WorkflowRequestBody {
  graph: GraphData;
  params?: Record<string, unknown>;
  workflow_id?: string;
  job_id?: string;
}

export function createWorkflowHandler(
  opts: CreateWorkflowHandlerOptions
): (req: Request) => Promise<Response> {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return jsonError(405, "method_not_allowed");
    }

    let body: WorkflowRequestBody;
    try {
      body = (await req.json()) as WorkflowRequestBody;
    } catch {
      return jsonError(400, "invalid_json");
    }

    if (!body || typeof body !== "object" || !body.graph) {
      return jsonError(400, "missing_graph");
    }

    try {
      if (opts.beforeRun) body = await opts.beforeRun(body, req);
    } catch {
      return jsonError(400, "before_run_failed");
    }

    const context = (await opts.createContext?.(req)) ?? undefined;
    const runOpts: RunWorkflowOptions = {
      graph: body.graph,
      registry: opts.registry,
      params: body.params,
      workflowId: body.workflow_id,
      jobId: body.job_id,
      context: context instanceof ProcessingContext ? context : undefined,
      signal: req.signal,
      platform: opts.platform
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const enc = new TextEncoder();
        const write = (chunk: string): void => {
          controller.enqueue(enc.encode(chunk));
        };
        try {
          const gen = runWorkflow(runOpts);
          while (true) {
            const { value, done } = await gen.next();
            if (done) {
              write(formatSse("result", value));
              break;
            }
            write(formatSse(null, value));
          }
        } catch {
          write(
            formatSse("error", {
              message: "Workflow execution failed"
            })
          );
        } finally {
          controller.close();
        }
      },
      cancel() {
        // Request aborted — runWorkflow honours opts.signal.
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        connection: "keep-alive"
      }
    });
  };
}

function formatSse(event: string | null, data: unknown): string {
  const payload = JSON.stringify(data);
  const prefix = event ? `event: ${event}\n` : "";
  return `${prefix}data: ${payload}\n\n`;
}

const ERROR_MESSAGES: Record<string, string> = {
  method_not_allowed: "POST required",
  invalid_json: "Body must be valid JSON",
  missing_graph: "Body must include a `graph`",
  before_run_failed: "beforeRun hook failed"
};

function jsonError(status: number, code: string): Response {
  return new Response(
    JSON.stringify({
      error: code,
      message: ERROR_MESSAGES[code] ?? "Request failed"
    }),
    {
      status,
      headers: { "content-type": "application/json" }
    }
  );
}

export type { ProcessingMessage };
