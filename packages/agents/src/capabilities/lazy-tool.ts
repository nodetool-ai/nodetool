/** Capability-to-Tool compatibility for consumers that still require Tool[]. */

import { Tool } from "../tools/base-tool.js";

import { capabilitySpec, loadCapabilityImpl } from "./registry.js";
import { invokeCapability, ungatedCapabilityRun } from "./invoke.js";
import type { CapabilityRunSource } from "./adapters.js";
import type { CapabilityImpl, CapabilitySpec } from "./types.js";
import { LazyCapabilityTool } from "./lazy-tool-core.js";
export { nativeCapabilityTool } from "./lazy-tool-core.js";

/**
 * Expose one capability as a `Tool` from its spec alone.
 *
 * The run is either supplied directly or cached per context from the context the
 * caller passes to `process()`; a caller that names none gets a run over the
 * context and nothing else, which is what every belt tool needs. Passing
 * `impl` skips the lazy `loadCapabilityImpl` lookup — for a caller (such as
 * `toolFromCapability`) that already has the implementation in hand.
 */
export function toolFromLazyCapability(
  spec: CapabilitySpec,
  run: CapabilityRunSource = ungatedCapabilityRun,
  impl?: CapabilityImpl
): Tool {
  return new LazyCapabilityTool(
    spec,
    run,
    impl ?? (async (source, args) => (await loadCapabilityImpl(spec.name))(source, args)),
    invokeCapability
  );
}

/**
 * The same, by wire name. A name no module declares is a programming error —
 * a belt lists names this build ships — so it throws rather than returning a
 * tool that fails later, at call time, in front of a model.
 */
export function toolForCapabilityName(
  name: string,
  run: CapabilityRunSource = ungatedCapabilityRun
): Tool {
  const spec = capabilitySpec(name);
  if (spec === undefined) {
    throw new Error(`no capability is registered for "${name}"`);
  }
  return toolFromLazyCapability(spec, run);
}
