/** Capability-to-Tool compatibility for consumers that still require Tool[]. */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";

import { capabilitySpec, loadCapabilityImpl } from "./registry.js";
import { invokeCapability, ungatedCapabilityRun } from "./invoke.js";
import type { CapabilityRunSource } from "./adapters.js";
import type {
  CapabilityExport,
  CapabilityRun,
  CapabilityImpl,
  CapabilitySpec
} from "./types.js";
import { isFunction } from "../utils/type-guards.js";

class LazyCapabilityTool extends Tool {
  readonly name: string;
  readonly description: string;
  override readonly needsToolCallId: boolean;
  private readonly entry: CapabilityExport;

  constructor(
    private readonly spec: CapabilitySpec,
    private readonly runSource: CapabilityRunSource,
    providedImpl?: CapabilityImpl
  ) {
    super();
    this.name = spec.name;
    this.description = spec.description;
    this.needsToolCallId = spec.needsToolCallId === true;
    this.entry = {
      spec,
      impl:
        providedImpl ??
        (async (run, args) => (await loadCapabilityImpl(spec.name))(run, args))
    };
  }

  override get inputSchema(): JsonSchema {
    return this.spec.inputSchema;
  }

  override userMessage(params: Record<string, unknown>): string {
    const template = this.spec.userMessage?.(params);
    if (template) return template;
    return super.userMessage(params);
  }

  capability(): CapabilityExport {
    return this.entry;
  }

  private readonly runs = new WeakMap<ProcessingContext, CapabilityRun>();

  run(context: ProcessingContext): CapabilityRun {
    if (!isFunction(this.runSource)) {
      return this.runSource;
    }
    let run = this.runs.get(context);
    if (!run) {
      run = this.runSource(context);
      this.runs.set(context, run);
    }
    return run;
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return invokeCapability(this.run(context), this.capability(), params);
  }
}

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
  return new LazyCapabilityTool(spec, run, impl);
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

/** Only legacy Tool[] consumers should inspect this compatibility wrapper. */
export function nativeCapabilityTool(
  tool: Tool
): LazyCapabilityTool | undefined {
  return tool instanceof LazyCapabilityTool ? tool : undefined;
}
