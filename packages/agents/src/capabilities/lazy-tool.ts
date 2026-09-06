/**
 * A `Tool` built from an eager spec. Its implementation either arrives at
 * construction time (a caller that already has one, e.g. a ported class
 * migrating to `toolFromCapability`) or loads lazily at first call from the
 * module that owns the spec's name — which is what replaced the ninety-odd
 * one-line `extends CapabilityTool` subclasses. A belt has to be assembled
 * synchronously — `getBuiltinTools()` and `getAllMcpTools()` have synchronous
 * callers everywhere — but only the *spec* has to be there at assembly time:
 * the name, description, schema and message template are what a provider list
 * and a permission prompt read. `Tool.process()` is already async, so a lazy
 * implementation can arrive on the first invoke.
 *
 * Gating is unchanged and stays single-pass. This calls the implementation
 * directly rather than `run.invoke`: a belt is gated from the outside by
 * `gateTools`, which runs the one ladder in `invoke.ts`. Routing through
 * `invoke` here would gate twice.
 *
 * Argument validation is single-pass for the same reason. `Tool.execute`
 * exposes no `schema`, so it does not pre-parse; the check runs here, once,
 * through `validateCapabilityArgs` — the same function `gatedCall` runs for a
 * call that arrives through `invoke` instead.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";
import { validateCapabilityArgs, withSnakeCaseAliases } from "./args.js";
import { capabilitySpec, loadCapabilityImpl } from "./registry.js";
import { ungatedCapabilityRun } from "./invoke.js";
import type { CapabilityRunSource } from "./adapters.js";
import type { CapabilityImpl, CapabilitySpec } from "./types.js";
import { isFunction } from "../utils/type-guards.js";

class LazyCapabilityTool extends Tool {
  readonly name: string;
  readonly description: string;
  override readonly needsToolCallId: boolean;

  constructor(
    private readonly spec: CapabilitySpec,
    private readonly runSource: CapabilityRunSource,
    private readonly providedImpl?: CapabilityImpl
  ) {
    super();
    this.name = spec.name;
    this.description = spec.description;
    this.needsToolCallId = spec.needsToolCallId === true;
  }

  override get inputSchema(): JsonSchema {
    return this.spec.inputSchema;
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
    const checked = validateCapabilityArgs(
      this.spec,
      withSnakeCaseAliases(params)
    );
    if (!checked.ok) return checked.error;
    const impl = this.providedImpl ?? (await loadCapabilityImpl(this.spec.name));
    const run = isFunction(this.runSource)
      ? this.runSource(context)
      : this.runSource;
    return impl(run, checked.args);
  }
}

/**
 * Expose one capability as a `Tool` from its spec alone.
 *
 * The run is either supplied directly or built per call from the context the
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
