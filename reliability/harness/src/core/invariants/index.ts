/**
 * §6 invariant modules (docs/RELIABILITY_ARCHITECTURE.md §6, §12; task C3).
 *
 * Each module is a pure `(record: RunRecord) => Violation[]`. This barrel is
 * exported on its own — not yet re-exported from the harness's main
 * `src/index.ts` — because C4 wires the main barrel; importing from
 * `@nodetool-ai/reliability-harness/core/invariants` (or this file's
 * relative path within the package) works today.
 */
export * from "./types.js";
export * from "./status-sets.js";
export * from "./lifecycle.js";
export * from "./terminal-uniqueness.js";
export * from "./leaks.js";
export * from "./state-machine.js";
export * from "./protocol-validity.js";

import { checkLifecycle } from "./lifecycle.js";
import { checkTerminalUniqueness } from "./terminal-uniqueness.js";
import { checkLeaks } from "./leaks.js";
import { checkStateMachine } from "./state-machine.js";
import { checkProtocolValidity } from "./protocol-validity.js";
import type { InvariantCheck } from "./types.js";

/**
 * Every invariant module keyed by the family name journeys declare in
 * `journey.json`'s `assertions.invariants` (§4). C4's runner is expected to
 * look names up here rather than importing each module by hand.
 *
 * `lifecycle-pairing` and `cleanup-leaks` are aliases for `lifecycle` and
 * `leaks`: the seed journeys under `reliability/journeys/*.json` (C1/C2) were
 * authored against §6's prose section headers ("Lifecycle", "Cleanup and
 * leaks") rather than this module's own key names, and the manifest schema
 * (`core/journey.ts`) only checks that `invariants` is a non-empty array of
 * strings, not that each name resolves — so both spellings need to resolve
 * for those journeys' declared invariants to actually run under `compare.ts`.
 */
export const INVARIANT_CHECKS: Readonly<Record<string, InvariantCheck>> = {
  lifecycle: checkLifecycle,
  "lifecycle-pairing": checkLifecycle,
  "terminal-uniqueness": checkTerminalUniqueness,
  leaks: checkLeaks,
  "cleanup-leaks": checkLeaks,
  "state-machine": checkStateMachine,
  "protocol-validity": checkProtocolValidity
};
