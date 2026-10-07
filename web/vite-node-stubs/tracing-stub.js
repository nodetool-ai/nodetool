// Browser replacement for server tracing helpers. The real helpers reach the
// Node OpenTelemetry SDK and exporters through telemetry.js. Browser run spans
// use browserRunTrace.ts, while these wrappers preserve kernel/provider calls.
const run = (_attributes, fn) => fn(null);

export const withWorkflowSpan = run;
export const withNodeSpan = run;
export const withAgentSpan = (_kind, _attrs, fn) => fn(null);
export const withSpan = (_name, _attrs, fn) => fn(null);
export const withTaskSpan = (_kind, _name, _attrs, fn) => fn(null);
export const SpanStatusCode = { UNSET: 0, OK: 1, ERROR: 2 };
export const markSpanError = () => {};

export async function* withSpanGen(_name, _attrs, genFactory) {
  return yield* genFactory();
}
export async function* withAgentSpanGen(_kind, _attrs, genFactory) {
  return yield* genFactory();
}

export const withUsageCapture = (fn) => fn();
export const withModalityCapture = (fn) => fn(false);
export const setLastUsage = () => {};
export const consumeLastUsage = () => null;
export const peekLastUsage = () => null;
export const setLastRequest = () => {};
export const peekLastRequest = () => null;
export const createUsageSlot = () => ({
  runInSlot: (fn) => fn(),
  getUsage: () => null,
  getRequest: () => null
});
