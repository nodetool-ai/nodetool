/**
 * WS-seam fault modules (docs/RELIABILITY_ARCHITECTURE.md §9 "WS transport"
 * row; task D2). Each of `cli.ts`'s `KNOWN_FAULT_TYPES` `ws-*` entries maps
 * 1:1 onto a {@link WsProxyFaultKind} `net-proxy.ts` understands;
 * `configure()` just writes that kind (plus whatever numeric knobs the
 * journey/`--faults` call supplied in `fault.params`) into the process-wide
 * slot `ws-proxy.ts` exposes, and returns a teardown that restores whatever
 * was there before — same shape as `provider-faults.ts`'s
 * `configureProviderFault`, one process-wide slot instead of a provider-id
 * keyed map because only one ws-server driver run is ever in flight under a
 * given fault at a time (there is exactly one `WsServerDriver.run()` per
 * `compareJourney` surface iteration).
 *
 * Applies to the "ws-server" surface only — `applyFaults` in `compare.ts`
 * already restricts by `fault.surface` when the journey sets one, but these
 * modules are surface-agnostic themselves (the kernel driver never touches
 * `getActiveWsProxyFault()`, so configuring a ws-* fault for a kernel run is
 * inert, not an error).
 */
import type { WsProxyFaultKind } from "./net-proxy.js";
import { getActiveWsProxyFault, setActiveWsProxyFault } from "./ws-proxy.js";
import { registerFaultModule } from "./registry.js";
import type { FaultContext, FaultModule, FaultTeardown } from "./types.js";

/** `cli.ts`'s `KNOWN_FAULT_TYPES` `ws-*` entries, mapped to the
 * `WsProxyFaultKind` `net-proxy.ts`'s proxy understands. */
const FAULT_KIND_BY_NAME: Readonly<Record<string, WsProxyFaultKind>> = {
  "ws-drop-no-fin": "drop-no-fin",
  "ws-delay": "delay",
  "ws-reorder": "reorder",
  "ws-fragment": "fragment",
  "ws-stall-reads": "stall-reads",
  "ws-abrupt-close": "abrupt-close"
};

function faultParams(fault: FaultContext["fault"]): Record<string, unknown> {
  return fault.params ?? {};
}

function numericParam(
  params: Record<string, unknown>,
  key: string
): number | undefined {
  const value = params[key];
  return typeof value === "number" ? value : undefined;
}

function configureWsFault(kind: WsProxyFaultKind, ctx: FaultContext): FaultTeardown {
  const params = faultParams(ctx.fault);
  const previous = getActiveWsProxyFault();
  setActiveWsProxyFault({
    kind,
    afterFrames: numericParam(params, "afterFrames"),
    delayMs: numericParam(params, "delayMs"),
    chunkBytes: numericParam(params, "chunkBytes")
  });
  return () => {
    setActiveWsProxyFault(previous);
  };
}

function makeWsFaultModule(name: string, kind: WsProxyFaultKind): FaultModule {
  return {
    name,
    seam: "ws",
    configure: (ctx) => configureWsFault(kind, ctx)
  };
}

export const WS_FAULT_MODULES: readonly FaultModule[] = Object.entries(
  FAULT_KIND_BY_NAME
).map(([name, kind]) => makeWsFaultModule(name, kind));

/** Registers every ws-seam fault module. Called once from `faults/index.ts`'s
 * module-load side effect (mirrors `registerProviderFaultModules`). */
export function registerWsFaultModules(): void {
  for (const module of WS_FAULT_MODULES) {
    registerFaultModule(module);
  }
}
