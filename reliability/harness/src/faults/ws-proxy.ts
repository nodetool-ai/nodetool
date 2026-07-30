/**
 * WS-seam fault wiring (docs/RELIABILITY_ARCHITECTURE.md §9 "WS transport"
 * row; task D2). `ws-faults.ts`'s `FaultModule.configure()` calls only know
 * a `FaultContext` (journey/surface/fault) — never a driver instance
 * (`faults/types.ts`'s contract, which D2 doesn't touch) — so, exactly like
 * `provider-faults.ts` registers a fault-scripted provider into a
 * process-wide registry the driver already consults by provider id, this
 * module holds one process-wide "is a ws fault active right now" slot that
 * `drivers/ws-server.ts` consults on every run. Nothing here talks to a
 * socket directly; `net-proxy.ts` is the mechanism, this is the seam.
 */
import { WsFaultProxy, type WsProxyFaultConfig } from "./net-proxy.js";

let activeFault: WsProxyFaultConfig | null = null;

/** Set by a `ws-faults.ts` module's `configure()`; cleared by its teardown. */
export function setActiveWsProxyFault(config: WsProxyFaultConfig | null): void {
  activeFault = config;
}

export function getActiveWsProxyFault(): WsProxyFaultConfig | null {
  return activeFault;
}

/** A running proxy front-end plus enough to tear it down and (for the
 * client-reconnect-mid-run journey, outside the declarative fault matrix)
 * sever its connections on demand. */
export interface WsProxyFrontEnd {
  port: number;
  proxy: WsFaultProxy;
  close: () => Promise<void>;
}

/**
 * Called by `WsServerDriver.run()` right after it starts the real hermetic
 * server: when a ws-seam fault is currently active, spins up a
 * {@link WsFaultProxy} in front of `targetPort` and returns its listening
 * port — the driver connects its client there instead of straight to the
 * server, so every ws-* fault applies transparently to the existing driver
 * without the driver knowing which fault kind it is. Returns `null` when no
 * ws fault is active (the overwhelming majority of runs), in which case the
 * driver connects directly exactly as it did before D2 — this function is a
 * no-op on the hot path.
 */
export async function maybeFrontWithProxy(
  targetHost: string,
  targetPort: number
): Promise<WsProxyFrontEnd | null> {
  const config = activeFault;
  if (!config) return null;
  const proxy = new WsFaultProxy(targetHost, targetPort, config);
  const port = await proxy.listen();
  return { port, proxy, close: () => proxy.close() };
}
