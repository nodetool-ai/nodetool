/** Transitional adapters for consumers and implementations that still use Tool.
 * Retire capabilityFromTool when the remaining Tool implementations become
 * native capabilities. Never use it to re-adapt a native capability wrapper.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Tool } from "../tools/base-tool.js";
import { capabilityCategoryFor } from "./registry.js";
import { nativeCapabilityTool, toolFromLazyCapability } from "./lazy-tool.js";
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
 * spec's when the name is a capability, so `gateLegacyTools` decides exactly as
 * `run.invoke` does for the same name; the classification map is consulted
 * only for a `Tool` that is not a capability, where the map is the one place
 * its class is declared.
 */
export function capabilityFromTool(tool: Tool): CapabilityExport {
  if (nativeCapabilityTool(tool)) {
    throw new Error(
      "Native capabilities must not pass through capabilityFromTool"
    );
  }
  const spec: CapabilitySpec = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    category: capabilityCategoryFor(tool.name),
    zodSchema: tool.schema,
    needsToolCallId: tool.needsToolCallId,
    userMessage: (args) => tool.userMessage(args)
  };
  return {
    spec,
    impl: (run, args) => tool.process(run.context, args)
  };
}
