import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

export class OutputNode extends BaseNode {
  static readonly nodeType = "nodetool.output.Output";
            static readonly title = "Output";
            static readonly description = "Generic output node for any type.\n    output, result, sink, return";
        static readonly metadataOutputTypes = {
    output: "any"
  };
          static readonly basicFields = [
  "name",
  "value"
];
  
          static readonly isStreamingOutput = true;
  @prop({ type: "str", default: "", title: "Name", description: "The parameter name for the workflow." })
  declare name: any;

  @prop({ type: "any", default: null, title: "Value", description: "The value of the output." })
  declare value: any;

  @prop({ type: "str", default: "", title: "Description", description: "The description of the output for the workflow." })
  declare description: any;




  private inferOutputType(value: unknown): string {
    if (value === null || value === undefined) return "any";
    if (typeof value === "string") return "str";
    if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
    if (typeof value === "boolean") return "bool";
    if (Array.isArray(value)) return "list";
    if (value && typeof value === "object") return "dict";
    return "any";
  }

  private async normalize(value: unknown, context?: ProcessingContext): Promise<unknown> {
    if (!context || typeof context.normalizeOutputValue !== "function") return value;
    return context.normalizeOutputValue(value);
  }

  private emitOutputUpdate(value: unknown, context?: ProcessingContext): void {
    if (!context || typeof context.emit !== "function") return;
    const nodeId = String(this.__node_id ?? this.name ?? this.__node_name ?? "");
    const nodeName = String(this.__node_name ?? this.name ?? nodeId);
    const outputName =
      typeof this.name === "string" && this.name.trim().length > 0
        ? this.name
        : "output";
    context.emit({
      type: "output_update",
      node_id: nodeId,
      node_name: nodeName,
      output_name: outputName,
      value,
      output_type: this.inferOutputType(value),
      metadata: {},
    });
  }

  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    let value: unknown = this.value ?? null;
    if ("value" in inputs) {
      value = inputs.value;
    } else if ("input_value" in inputs) {
      value = inputs.input_value;
    } else if ("output" in inputs) {
      value = inputs.output;
    } else {
      const keys = Object.keys(inputs);
      if (keys.length === 1) value = inputs[keys[0]];
    }

    const normalized = await this.normalize(value, context);
    this.emitOutputUpdate(normalized, context);
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



  private async normalize(value: unknown, context?: ProcessingContext): Promise<unknown> {
    if (!context || typeof context.normalizeOutputValue !== "function") return value;
    return context.normalizeOutputValue(value);
  }

  private emitPreview(value: unknown, context?: ProcessingContext): void {
    if (!context || typeof context.emit !== "function") return;
    const nodeId = String(this.__node_id ?? this.name ?? this.__node_name ?? "");
    context.emit({
      type: "preview_update",
      node_id: nodeId,
      value,
    });
  }

  async process(inputs: Record<string, unknown>, context?: ProcessingContext): Promise<Record<string, unknown>> {
    let value: unknown;
    if ("value" in inputs) {
      value = inputs.value;
    } else {
      const keys = Object.keys(inputs);
      if (keys.length === 1) value = inputs[keys[0]];
      else value = this.value ?? null;
    }

    const normalized = await this.normalize(value, context);
    this.emitPreview(normalized, context);
    return { output: normalized };
  }
}

export const OUTPUT_NODES = [OutputNode, PreviewNode] as const;
