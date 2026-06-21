/**
 * POST /api/run — execute a workflow graph server-side and stream the result.
 *
 * `createWorkflowHandler` returns a Web-standard `(Request) => Response` that
 * runs the graph and streams every `ProcessingMessage` as Server-Sent Events,
 * ending with an `event: result` carrying the final `RunResult`.
 *
 * Request body (JSON): { graph, params?, workflow_id?, job_id? }
 *
 * Deployed to Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`). The
 * `nodejs_compat` flag (see wrangler.jsonc) provides the Node built-ins the
 * runtime stack lazy-loads. `platform: "workers"` makes the runner reject any
 * graph node that doesn't declare support for the Workers isolate before
 * execution starts.
 *
 * Secrets stay server-side: `createContext` builds a ProcessingContext whose
 * `secretResolver` reads from `process.env`. Under OpenNext + `nodejs_compat`,
 * Worker vars and secrets (`wrangler secret put OPENAI_API_KEY`, or `.dev.vars`
 * locally) are surfaced on `process.env`, so LLM nodes get their key without it
 * ever reaching the browser.
 */
import {
  createWorkflowHandler,
  envSecretResolver
} from "@nodetool-ai/workflow-runner";
import { ProcessingContext } from "@nodetool-ai/runtime/context";
import { createEdgeRegistry } from "@/lib/registry";

export const runtime = "nodejs";
// Streaming response — never statically optimize or cache.
export const dynamic = "force-dynamic";

const handler = createWorkflowHandler({
  registry: createEdgeRegistry("workers", { includeLlm: true }),
  platform: "workers",
  createContext: () =>
    new ProcessingContext({
      jobId: crypto.randomUUID(),
      // Resolve provider keys (OPENAI_API_KEY, …) from the Worker environment.
      secretResolver: envSecretResolver(process.env),
      // We stream via message listeners, so don't retain the pull queue.
      retainMessageQueue: false
    })
});

export function POST(req: Request): Promise<Response> {
  return handler(req);
}
