/**
 * Client-seam fault modules.
 *
 * - `client-slow-consumer`: the kernel driver holds each message for
 *   `params.delayMs` (default 10) before reading the next one, the way a
 *   browser worker that reads GPU textures back per message does. The run
 *   finishes and closes `session.messages` while the consumer is still
 *   holding a message, so a `MessageStream` that checks `closed` before
 *   draining what arrived during that hold drops the tail of the run (the
 *   last node results and the terminal `job_update`). Kernel surface only:
 *   the ws-server driver reads frames off a socket, where a slow reader is
 *   TCP backpressure rather than this iterator.
 *
 * The other `client-*` names in `cli.ts`'s `KNOWN_FAULT_TYPES` have no module
 * yet and report as unknown.
 */
import { registerFaultModule } from "./registry.js";
import type { FaultContext, FaultModule, FaultTeardown } from "./types.js";

const DEFAULT_CONSUMER_DELAY_MS = 10;

let consumerDelayMs: number | null = null;

/** Consulted by the kernel driver's message pump. Non-null only while
 * `client-slow-consumer` is configured for the current driver run. */
export function getInjectedConsumerDelayMs(): number | null {
  return consumerDelayMs;
}

function configureSlowConsumerFault(ctx: FaultContext): FaultTeardown {
  const previous = consumerDelayMs;
  const raw = Number(ctx.fault.params?.["delayMs"] ?? DEFAULT_CONSUMER_DELAY_MS);
  consumerDelayMs = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CONSUMER_DELAY_MS;
  return () => {
    consumerDelayMs = previous;
  };
}

export const CLIENT_FAULT_MODULES: readonly FaultModule[] = [
  {
    name: "client-slow-consumer",
    seam: "client",
    preservesOutcome: true,
    configure: configureSlowConsumerFault
  }
];

/** Registers every client-seam fault module this harness implements. */
export function registerClientFaultModules(): void {
  for (const module of CLIENT_FAULT_MODULES) {
    registerFaultModule(module);
  }
}
