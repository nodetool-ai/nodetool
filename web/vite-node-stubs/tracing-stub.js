// No-op stand-in for `@nodetool-ai/runtime/tracing` in the in-browser runner
// Web Worker. The real module's span helpers reach `telemetry.js`, which
// lazy-loads the OpenTelemetry Node SDK + OTLP/gRPC exporters — all server-only
// and unbundleable for a worker. The browser graph only ever reaches
// `withWorkflowSpan` / `withNodeSpan` (from the kernel); the rest are stubbed
// for safety. Each wrapper simply runs the work with a null span.
const run = (_attributes, fn) => fn(null);

export const withWorkflowSpan = run;
export const withNodeSpan = run;
export const withAgentSpan = run;
export const withSpan = (_name, _attrs, fn) => fn(null);

export async function* withSpanGen(_name, _attrs, genFactory) {
  yield* genFactory();
}
export async function* withAgentSpanGen(_kind, _attrs, genFactory) {
  yield* genFactory();
}

export const withUsageCapture = (fn) => fn();
export const setLastUsage = () => {};
export const consumeLastUsage = () => null;
export const peekLastUsage = () => null;
export const createUsageSlot = () => ({
  set: () => {},
  consume: () => null,
  peek: () => null
});
