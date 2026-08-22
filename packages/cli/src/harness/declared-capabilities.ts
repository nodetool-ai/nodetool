/**
 * The live half of the capability audit: every capability this build exports,
 * with the fingerprint of what it declares.
 *
 * Split from `capability-coverage.ts` so the rules and the gate stay pure and
 * importable without pulling in the agents package — the fixtures in
 * `harness-registry.test.ts` exercise them with hand-written inputs.
 */

import { listCapabilitySpecs, capabilityModuleOf } from "@nodetool-ai/agents";
import {
  capabilityContractFingerprint,
  type DeclaredCapability
} from "./capability-coverage.js";

/** Every exported capability, sorted by wire name. */
export function declaredCapabilities(): DeclaredCapability[] {
  return listCapabilitySpecs()
    .map((spec) => ({
      name: spec.name,
      module: capabilityModuleOf(spec.name) ?? "",
      contract: capabilityContractFingerprint(spec)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
