/**
 * Registers `@nodetool-ai/dsl/flow` as the agents' node-call backend.
 *
 * The agents package loads that module by name at run time, because a static
 * import would close a package cycle. The bundled server inlines the
 * workspace packages and stages no `@nodetool-ai/dsl` beside `server.mjs`, so
 * that run-time load fails there and `callNode` answered "does not resolve
 * here". This package sits above `dsl` in the graph, so it imports the module
 * statically and the bundler includes it.
 */
import { registerFlowBackend } from "@nodetool-ai/agents";
import * as dslFlow from "@nodetool-ai/dsl/flow";

let registered = false;

/** Idempotent. Call before a session runs a code action. */
export function registerDslFlowBackend(): void {
  if (registered) return;
  registered = true;
  registerFlowBackend(dslFlow);
}
