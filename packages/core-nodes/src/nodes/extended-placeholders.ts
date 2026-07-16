import { BaseNode } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { tagAsUniversal } from "@nodetool-ai/nodes-utils";

export function titleFromNodeType(nodeType: string): string {
  const parts = nodeType.split(".");
  return parts[parts.length - 1] ?? nodeType;
}

export function makePlaceholderNode(nodeType: string): NodeClass {
  class PlaceholderNode extends BaseNode {
    static readonly nodeType = nodeType;
    static readonly title = titleFromNodeType(nodeType);
    static readonly description = `Placeholder node for ${nodeType}`;
    static readonly inlineFields = [];
    static readonly inputFields = [];

    async process(): Promise<Record<string, unknown>> {
      return { output: this.getDynamic("value") ?? this.serialize() };
    }
  }

  return PlaceholderNode as unknown as NodeClass;
}

/**
 * Node types that currently need a generated placeholder. Empty today; add
 * fully-qualified node type strings here to register stand-ins for them.
 */
export const EXTENDED_PLACEHOLDER_NODE_TYPES: string[] = [];

export const EXTENDED_PLACEHOLDER_NODES: NodeClass[] = tagAsUniversal(
  EXTENDED_PLACEHOLDER_NODE_TYPES.map((nodeType) => makePlaceholderNode(nodeType))
);
