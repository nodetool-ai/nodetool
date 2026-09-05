/**
 * The two adapters that let capabilities and `Tool` instances coexist.
 *
 * `toolFromCapability` wraps a spec+impl as a `Tool`, so every belt that
 * consumes `Tool[]` — the runner, the MCP mount, the CLI, the evals —
 * consumes a ported namespace unchanged. It is a thin wrapper over
 * {@link toolFromLazyCapability}, which already carries the run/validate
 * logic this used to duplicate as its own `CapabilityTool` class; the two
 * differed only in where the implementation came from (`this.impl` here,
 * `loadCapabilityImpl(name)` there), which `toolFromLazyCapability`'s
 * optional `impl` parameter now covers. `capabilityFromTool` is the reverse,
 * for the long tail that has not been ported yet.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Tool } from "../tools/base-tool.js";
import { capabilityCategoryFor } from "./registry.js";
import { toolFromLazyCapability } from "./lazy-tool.js";
import type {
  CapabilityExport,
  CapabilityImpl,
  CapabilityRun,
  CapabilitySpec
} from "./types.js";

/**
 * How a wrapped capability gets its run: either one run fixed for the tool's
 * lifetime, or a factory the wrapper calls with the `ProcessingContext` the
 * caller passed to `process()`.
 */
export type CapabilityRunSource =
  | CapabilityRun
  | ((context: ProcessingContext) => CapabilityRun);

/**
 * Expose one capability as a `Tool`. The run is either supplied directly or
 * built per call from the context the caller passes to `process()`.
 */
export function toolFromCapability(
  spec: CapabilitySpec,
  impl: CapabilityImpl,
  run: CapabilityRunSource
): Tool {
  return toolFromLazyCapability(spec, run, impl);
}

/**
 * Wrap an existing `Tool` as a capability. The category is the registered
 * spec's when the name is a capability, so `gateTools` decides exactly as
 * `run.invoke` does for the same name; the classification map is consulted
 * only for a `Tool` that is not a capability, where the map is the one place
 * its class is declared.
 */
export function capabilityFromTool(tool: Tool): CapabilityExport {
  const spec: CapabilitySpec = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    category: capabilityCategoryFor(tool.name),
    needsToolCallId: tool.needsToolCallId,
    userMessage: (args) => tool.userMessage(args)
  };
  return {
    spec,
    impl: (run, args) => tool.process(run.context, args)
  };
}
