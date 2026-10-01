/** Permission compatibility for legacy consumers that require Tool[]. */
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { TOOL_CALL_ID_FIELD } from "../tools/subtask-fields.js";
import { Tool } from "../tools/base-tool.js";
import type { PermissionGateOptions } from "../tools/tool-permissions.js";
import { capabilityFromTool } from "./adapters.js";
import { nativeCapabilityTool } from "./lazy-tool.js";
import { contextSecretAvailability, createCapabilityRun } from "./invoke.js";
import type { CapabilityRun } from "./types.js";

/**
 * One invocation run per context and legacy belt. Native compatibility tools
 * contribute their original spec and implementation, never Tool.process().
 * Their injected dependencies remain scoped to the capability they belong to.
 */
export function gateLegacyTools(
  tools: Tool[],
  gate: PermissionGateOptions
): Tool[] {
  const runs = new WeakMap<ProcessingContext, CapabilityRun>();
  const runFor = (context: ProcessingContext): CapabilityRun => {
    let run = runs.get(context);
    if (run) {
      return run;
    }
    const capabilities = tools.map((tool) => {
      const native = nativeCapabilityTool(tool);
      if (!native) {
        return capabilityFromTool(tool);
      }
      const entry = native.capability();
      const source = native.run(context);
      let scoped: CapabilityRun | undefined;
      return {
        spec: entry.spec,
        impl: (beltRun: CapabilityRun, args: Record<string, unknown>) => {
          scoped ??= { ...source, gate: beltRun.gate, invoke: beltRun.invoke };
          return entry.impl(scoped, args);
        }
      };
    });
    run = createCapabilityRun({
      context,
      gate,
      capabilities,
      availableSecrets: contextSecretAvailability(context)
    });
    runs.set(context, run);
    return run;
  };
  return tools.map((inner) => new LegacyGatedTool(inner, runFor));
}

class LegacyGatedTool extends Tool {
  constructor(
    private readonly inner: Tool,
    private readonly runFor: (context: ProcessingContext) => CapabilityRun
  ) {
    super();
    this.needsToolCallId = inner.needsToolCallId;
  }
  get name() {
    return this.inner.name;
  }
  get description() {
    return this.inner.description;
  }
  override get inputSchema() {
    return this.inner.inputSchema;
  }
  override get schema() {
    return this.inner.schema;
  }
  override readonly needsToolCallId: boolean;
  override toProviderTool() {
    return this.inner.toProviderTool();
  }
  override userMessage(args: Record<string, unknown>) {
    return this.inner.userMessage(args);
  }
  run(context: ProcessingContext): CapabilityRun {
    return this.runFor(context);
  }
  override execute(
    context: ProcessingContext,
    args: Record<string, unknown> | null | undefined,
    options: { toolCallId?: string } = {}
  ) {
    const input = { ...Tool.stripMessage(args) };
    if (this.needsToolCallId && options.toolCallId) {
      input[TOOL_CALL_ID_FIELD] = options.toolCallId;
    }
    return this.runFor(context).invoke(this.name, input);
  }
  process(context: ProcessingContext, args: Record<string, unknown>) {
    return this.runFor(context).invoke(this.name, args);
  }
}

/** The owned run behind a Tool[] compatibility belt, for migrating consumers. */
export function capabilityRunForLegacyTool(
  tool: Tool,
  context: ProcessingContext
): CapabilityRun | undefined {
  if (tool instanceof LegacyGatedTool) {
    return tool.run(context);
  }
  return nativeCapabilityTool(tool)?.run(context);
}
