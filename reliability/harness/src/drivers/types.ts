/**
 * The driver contract every execution surface implements (§12).
 *
 * A driver runs one loaded {@link Journey} to completion on its surface and
 * returns a {@link RunRecord} — every frame, both directions, surface-tagged
 * — so the same journey compares cleanly across surfaces via `normalize.ts`
 * + `diff.ts`. C2 ships `kernel` (the oracle) and `ws-server`; C4 adds
 * `cli`/`browser`/`app-headless`/`packaged` behind this same interface.
 */
import type { Journey } from "../core/journey.js";
import type { RunRecord } from "../core/record.js";

export interface RunDriver {
  /** Matches `JourneySurface` (`core/journey.ts`) — e.g. "kernel", "ws-server". */
  readonly name: string;
  /** Runs `journey` to a terminal state on this surface and records every frame. */
  run(journey: Journey): Promise<RunRecord>;
}
