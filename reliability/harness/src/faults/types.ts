/**
 * Fault module plumbing (docs/RELIABILITY_ARCHITECTURE.md §9; task D1).
 *
 * A `FaultModule` is the harness's one extension point for fault injection:
 * one module per named fault (matching `cli.ts`'s `KNOWN_FAULT_TYPES` and a
 * journey's `faults` block entries, `core/journey.ts`'s `JourneyFault`),
 * registered by name in `registry.ts`. `compare.ts` looks a fault up by name
 * and calls `configure()` immediately before the driver run it applies to,
 * then calls the returned teardown immediately after — so a fault's
 * process-global side effects (today: the provider registry) never leak
 * across surfaces or across journeys.
 *
 * D1 ships the "provider" seam (`provider-faults.ts`). D2 (WS proxy) and D3
 * (bridge/host) add their own module files + `registerFaultModule` calls
 * without touching this file, `registry.ts`, or `compare.ts`'s wiring.
 */
import type { Journey, JourneyFault, JourneySurface } from "../core/journey.js";

/** The five fault seams §9 names. */
export type FaultSeam = "provider" | "ws" | "bridge" | "host" | "client";

/** What a `FaultModule.configure()` call is being asked to apply. */
export interface FaultContext {
  journey: Journey;
  /** The surface about to run (or that just ran) with this fault applied. */
  surface: JourneySurface | string;
  /** The journey-declared (or `--faults`-synthesized) fault entry itself —
   * carries `type`, the optional `surface` restriction, and `params`. */
  fault: JourneyFault;
}

/** Undoes whatever `configure()` did. Always called once per `configure()`
 * call, even when the driver run it wrapped threw. */
export type FaultTeardown = () => void | Promise<void>;

export interface FaultModule {
  /** Matches a `JourneyFault.type` / `KNOWN_FAULT_TYPES` entry exactly. */
  readonly name: string;
  readonly seam: FaultSeam;
  /** Applies the fault for the duration of one driver run. May be called
   * many times concurrently-in-sequence (once per applicable surface) across
   * one `compareJourney` call — implementations must not assume they're only
   * ever configured once per process. */
  configure(ctx: FaultContext): FaultTeardown | Promise<FaultTeardown>;
}
