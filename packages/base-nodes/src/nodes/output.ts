import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

export class OutputNode extends BaseNode {
  static readonly nodeType = "nodetool.output.Output";
  static readonly title = "Output";
  static readonly description =
    "Generic output node for any type.\n    output, result, sink, return";
  static readonly metadataOutputTypes = {
    output: "any"
  };
  static readonly basicFields = ["name", "value"];

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "The parameter name for the workflow."
  })
  declare name: any;

  @prop({
    type: "any",
    default: null,
    title: "Value",
    description: "The value of the output."
  })
  declare value: any;

  @prop({
    type: "str",
    default: "",
    title: "Description",
    description: "The description of the output for the workflow."
  })
  declare description: any;

  private async normalize(
    value: unknown,
    context?: ProcessingContext
  ): Promise<unknown> {
    if (!context || typeof context.normalizeOutputValue !== "function")
      return value;
    return context.normalizeOutputValue(value);
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const value = this.value ?? null;

    const normalized = await this.normalize(value, context);
    // Don't emit output_update here — the runner already emits one
    // per output handle from the result. Emitting here caused duplicates.
    return { output: normalized };
  }
}

export class PreviewNode extends BaseNode {
  static readonly nodeType = "nodetool.workflows.base_node.Preview";
  static readonly title = "Preview";
  static readonly description = "Preview values inside the workflow graph";
  @prop({ type: "any", default: null })
  declare value: any;

  @prop({ type: "str", default: "" })
  declare name: any;

  private async normalize(
    value: unknown,
    context?: ProcessingContext
  ): Promise<unknown> {
    if (!context || typeof context.normalizeOutputValue !== "function")
      return value;
    return context.normalizeOutputValue(value);
  }

  private emitPreview(value: unknown, context?: ProcessingContext): void {
    if (!context || typeof context.emit !== "function") return;
    const nodeId = String(
      this.__node_id ?? this.name ?? this.__node_name ?? ""
    );
    context.emit({
      type: "preview_update",
      node_id: nodeId,
      value
    });
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const value = this.value ?? null;

    const normalized = await this.normalize(value, context);
    this.emitPreview(normalized, context);
    return { output: normalized };
  }
}

export const OUTPUT_NODES = [OutputNode, PreviewNode] as const;
