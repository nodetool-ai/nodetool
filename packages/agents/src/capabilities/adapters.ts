/**
 * The two adapters that let capabilities and `Tool` instances coexist during
 * the migration.
 *
 * `toolFromCapability` wraps a spec+impl as a `Tool`, so every belt that
 * consumes `Tool[]` today — the runner, the MCP mount, the CLI, the evals —
 * consumes a ported namespace unchanged. `capabilityFromTool` is the reverse,
 * for the long tail that has not been ported yet. Both die in PR 12.
 */

import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import type { ZodType } from "zod";
import { Tool } from "../tools/base-tool.js";
import { permissionCategoryFor } from "../tools/tool-permissions.js";
import { withSnakeCaseAliases } from "./args.js";
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

function isRunFactory(
  source: CapabilityRunSource
): source is (context: ProcessingContext) => CapabilityRun {
  return typeof source === "function";
}

/**
 * A `Tool` whose `process()` is one capability implementation.
 *
 * Exported so a ported tool class can survive as a one-line subclass while its
 * callers migrate — the class keeps its constructor and its wire identity, and
 * the behaviour comes from the capability. Both die in PR 12.
 */
export class CapabilityTool extends Tool {
  readonly name: string;
  readonly description: string;
  /**
   * A capability that nests what it runs under the caller's card declares the
   * need in its spec, so the wrapper asks `Tool.execute` for the id the same
   * way the class it replaces did.
   */
  override readonly needsToolCallId: boolean;

  constructor(
    private readonly spec: CapabilitySpec,
    private readonly impl: CapabilityImpl,
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
   * The Zod schema for the capabilities whose identity is one, exactly as
   * {@link toolFromLazyCapability} exposes it: `Tool.execute` then validates on
   * the way in, where the class this replaces validated.
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
    const run = isRunFactory(this.runSource)
      ? this.runSource(context)
      : this.runSource;
    return this.impl(run, withSnakeCaseAliases(params));
  }
}

/**
 * Expose one capability as a `Tool`. The run is either supplied directly or
 * built per call from the context the caller passes to `process()`.
 */
export function toolFromCapability(
  spec: CapabilitySpec,
  impl: CapabilityImpl,
  run: CapabilityRunSource
): Tool {
  return new CapabilityTool(spec, impl, run);
}

/**
 * Wrap an existing `Tool` as a capability. The category comes from the
 * classification map the gate reads today, so a tool that has not been ported
 * keeps exactly the class it is gated at now.
 */
export function capabilityFromTool(tool: Tool): CapabilityExport {
  const spec: CapabilitySpec = {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    category: permissionCategoryFor(tool.name),
    needsToolCallId: tool.needsToolCallId,
    userMessage: (args) => tool.userMessage(args)
  };
  return {
    spec,
    impl: (run, args) => tool.process(run.context, args)
  };
}
