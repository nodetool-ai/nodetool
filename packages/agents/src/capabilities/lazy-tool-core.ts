import type { ProcessingContext, JsonSchema } from "@nodetool-ai/runtime";
import { Tool } from "../tools/base-tool.js";
import type { CapabilityRunSource } from "./adapters.js";
import type { CapabilityExport, CapabilityRun, CapabilityImpl, CapabilitySpec } from "./types.js";
import { isFunction } from "../utils/type-guards.js";

export class LazyCapabilityTool extends Tool {
  readonly name: string;
  readonly description: string;
  override readonly needsToolCallId: boolean;
  private readonly entry: CapabilityExport;

  constructor(
    private readonly spec: CapabilitySpec,
    private readonly runSource: CapabilityRunSource,
    providedImpl: CapabilityImpl,
    private readonly invoke: (run: CapabilityRun, entry: CapabilityExport, args: Record<string, unknown>) => Promise<unknown>
  ) {
    super();
    this.name = spec.name;
    this.description = spec.description;
    this.needsToolCallId = spec.needsToolCallId === true;
    this.entry = {
      spec,
      impl: providedImpl
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
    return this.invoke(this.run(context), this.capability(), params);
  }
}

/** Only legacy Tool[] consumers should inspect this compatibility wrapper. */
export function nativeCapabilityTool(
  tool: Tool
): LazyCapabilityTool | undefined {
  return tool instanceof LazyCapabilityTool ? tool : undefined;
}
