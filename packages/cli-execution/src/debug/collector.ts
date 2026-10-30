/**
 * Re-export of the shared execution-summary collector.
 *
 * The reducer lives in `@nodetool-ai/execution` so the CLI harness, the HTTP
 * debug endpoint and the agent-facing `debug_workflow` tool all distill a run
 * the same way. This module keeps the CLI's original import path.
 */
export {
  collectExecutionSummary,
  previewValue
} from "@nodetool-ai/execution/debug";
