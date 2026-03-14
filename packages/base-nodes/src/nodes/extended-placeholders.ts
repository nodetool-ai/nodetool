import { BaseNode } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

export function titleFromNodeType(nodeType: string): string {
  const parts = nodeType.split(".");
  return parts[parts.length - 1] ?? nodeType;
}

export function makePlaceholderNode(nodeType: string): NodeClass {
  class PlaceholderNode extends BaseNode {
    static readonly nodeType = nodeType;
    static readonly title = titleFromNodeType(nodeType);
    static readonly description = `Placeholder node for ${nodeType}`;

    async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
      if ("output" in inputs) return { output: inputs.output };
      if ("value" in inputs) return { output: inputs.value };
      if ("input_value" in inputs) return { output: inputs.input_value };
      const keys = Object.keys(inputs);
      if (keys.length === 1) return { output: inputs[keys[0]] };
      return { output: inputs };
    }
  }

  return PlaceholderNode as unknown as NodeClass;
}

export const EXTENDED_PLACEHOLDER_NODE_TYPES = [] as const;

export const EXTENDED_PLACEHOLDER_NODES: NodeClass[] =
  EXTENDED_PLACEHOLDER_NODE_TYPES.map((nodeType) => makePlaceholderNode(nodeType));
