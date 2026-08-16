/**
 * A `Tool` built from an eager spec, whose implementation loads at first call.
 *
 * This is what replaced the ninety-odd one-line `extends CapabilityTool`
 * subclasses. A belt has to be assembled synchronously — `getBuiltinTools()`
 * and `getAllMcpTools()` have synchronous callers everywhere — but only the
 * *spec* has to be there at assembly time: the name, description, schema and
 * message template are what a provider list and a permission prompt read.
 * `Tool.process()` is already async, so the implementation can arrive on the
 * first invoke, from the one module that owns it.
 *
 * Gating is unchanged and stays single-pass. Like `CapabilityTool` before it,
 * this calls the implementation directly rather than `run.invoke`: a belt is
 * gated from the outside by `gateTools`, which runs the one ladder in
 * `invoke.ts`. Routing through `invoke` here would gate twice.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { JsonSchema } from "@nodetool-ai/runtime";
import type { ZodType } from "zod";
import { Tool } from "../tools/base-tool.js";
import { capabilitySpec, loadCapabilityImpl } from "./registry.js";
import { ungatedCapabilityRun } from "./invoke.js";
import type { CapabilityRunSource } from "./adapters.js";
import type { CapabilitySpec } from "./types.js";
import { isFunction } from "../utils/type-guards.js";

class LazyCapabilityTool extends Tool {
  readonly name: string;
  readonly description: string;
  override readonly needsToolCallId: boolean;

  constructor(
    private readonly spec: CapabilitySpec,
    private readonly runSource: CapabilityRunSource
  ) {
    super();
    this.name = spec.name;
    this.description = spec.description;
    this.needsToolCallId = spec.needsToolCallId === true;
  }

  override get inputSchema(): JsonSchema {
    return this.spec.inputSchema;
  }

  /**
   * The Zod schema for the capabilities whose identity is one. `Tool.execute`
   * then validates on the way in, exactly where the class this replaced did.
   */
  override get schema(): ZodType | undefined {
    return this.spec.zodSchema;
  }

  override userMessage(params: Record<string, unknown>): string {
    const template = this.spec.userMessage?.(params);
    if (template) return template;
    return super.userMessage(params);
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const impl = await loadCapabilityImpl(this.spec.name);
    const run =
      isFunction(this.runSource)
        ? this.runSource(context)
        : this.runSource;
    return impl(run, params);
  }
}

/**
 * Expose one capability as a `Tool` from its spec alone.
 *
 * The run is either supplied directly or built per call from the context the
 * caller passes to `process()`; a caller that names none gets a run over the
 * context and nothing else, which is what every belt tool needs.
 */
export function toolFromLazyCapability(
  spec: CapabilitySpec,
  run: CapabilityRunSource = ungatedCapabilityRun
): Tool {
  return new LazyCapabilityTool(spec, run);
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
