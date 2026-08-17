/**
 * `@nodetool-ai/dsl/flow` — call a node as an async function.
 *
 * See docs/dsl-native-flow-design.md. This barrel is the host-side entry
 * point: the typed per-namespace callables are generated alongside it.
 */

export {
  startFlow,
  createFlowForContext,
  resolveFlow,
  resetDefaultFlow,
  FlowClosedError,
  FlowAbortError,
  DEFAULT_EMISSION_QUEUE_LIMIT
} from "./core.js";
export type {
  Flow,
  FlowOptions,
  FlowCallEvent,
  FlowCallPhase,
  CallOptions
} from "./core.js";

export { invoke } from "./invoke.js";

export {
  invokeStream,
  invokeGenStream,
  invokeRunStream,
  foldEmissions,
  EmissionCancelledError
} from "./streaming.js";
export type { StreamEmission, StreamSource } from "./streaming.js";
