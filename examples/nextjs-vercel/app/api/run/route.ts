/**
 * POST /api/run — execute a workflow graph server-side and stream the result.
 *
 * `createWorkflowHandler` returns a Web-standard `(Request) => Response` that
 * runs the graph and streams every `ProcessingMessage` as Server-Sent Events,
 * ending with an `event: result` carrying the final `RunResult`.
 *
 * Request body (JSON): { graph, params?, workflow_id?, job_id? }
 *
 * On Vercel we run this on the **Node.js runtime** for full compatibility with
 * the kernel/runtime stack. `platform: "node"` makes the runner reject any
 * graph node that doesn't declare support for Node before execution starts.
 */
import { createWorkflowHandler } from "@nodetool-ai/workflow-runner";
import { createEdgeRegistry } from "@/lib/registry";

export const runtime = "nodejs";
// Streaming response — never statically optimize or cache.
export const dynamic = "force-dynamic";
// Allow longer-running workflows (seconds). Hobby caps lower; Pro allows more.
export const maxDuration = 60;

const handler = createWorkflowHandler({
  registry: createEdgeRegistry("node"),
  platform: "node"
});

export function POST(req: Request): Promise<Response> {
  return handler(req);
}
