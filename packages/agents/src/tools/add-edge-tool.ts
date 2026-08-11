/**
 * AddEdgeTool -- planner tool that connects two nodes in the graph.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { NodeRegistry, NodeMetadata } from "@nodetool-ai/node-sdk";
import { slotTypeToString } from "@nodetool-ai/node-sdk";
import { TypeMetadata } from "@nodetool-ai/protocol";
import { Tool } from "./base-tool.js";
import { type GraphBuilder } from "../graph-builder.js";
import {
  isUndeclaredDynamicOutput,
  toSlotTypeRecord,
  UNTYPED_SLOT_TYPE
} from "../dynamic-slots.js";

/** Render a node's TypeMetadata into the string form TypeMetadata.fromString parses. */
function typeMetaToString(
  tm: NodeMetadata["properties"][number]["type"] | undefined
): string | undefined {
  if (!tm || !tm.type) return undefined;
  const args = (tm.type_args ?? []).map(typeMetaToString).filter(Boolean);
  return args.length > 0 ? `${tm.type}[${args.join(", ")}]` : tm.type;
}

/**
 * Loose data-edge type compatibility, identical to the kernel's
 * `validateEdgeTypes` (Graph): compatible types, "any", numeric widening,
 * unions, list element types, and scalar-into-list aggregation. Returns true
 * when either side's type is unknown so we never block on missing metadata.
 */
function edgeTypesCompatible(
  sourceType: string | undefined,
  targetType: string | undefined
): boolean {
  if (!sourceType || !targetType) return true;
  const sourceMeta = TypeMetadata.fromString(sourceType);
  const targetMeta = TypeMetadata.fromString(targetType);
  const elementCompatible =
    targetMeta.isListType() &&
    !sourceMeta.isListType() &&
    (targetMeta.args.length === 0 ||
      sourceMeta.isCompatibleWith(targetMeta.args[0]));
  return sourceMeta.isCompatibleWith(targetMeta) || elementCompatible;
}

const ADD_EDGE_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    source: {
      type: "string" as const,
      description: "ID of the source node"
    },
    source_handle: {
      type: "string" as const,
      description: "Output slot name on the source node"
    },
    target: {
      type: "string" as const,
      description: "ID of the target node"
    },
    target_handle: {
      type: "string" as const,
      description: "Input property name on the target node"
    }
  },
  required: ["source", "source_handle", "target", "target_handle"] as string[]
};

export class AddEdgeTool extends Tool {
  readonly name = "add_edge";
  readonly description =
    "Connect two nodes by creating an edge from a source output to a target input.";
  readonly jsonSchema: Record<string, unknown> = ADD_EDGE_INPUT_SCHEMA;

  constructor(
    private readonly builder: GraphBuilder,
    private readonly registry: NodeRegistry
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const source = params["source"] as string | undefined;
    const sourceHandle = params["source_handle"] as string | undefined;
    const target = params["target"] as string | undefined;
    const targetHandle = params["target_handle"] as string | undefined;

    if (!source || !sourceHandle || !target || !targetHandle) {
      return {
        status: "error",
        errors: [
          "All fields required: source, source_handle, target, target_handle"
        ]
      };
    }

    // Validate handles against registry metadata for deterministic nodes
    const validationErrors: string[] = [];

    let sourceType: string | undefined;
    let targetType: string | undefined;
    /** Type metadata of the source output, reused to declare a new slot. */
    let sourceTypeMeta: NodeMetadata["outputs"][number]["type"] | undefined;
    /** Set when the edge lands on a dynamic input with no declaration yet. */
    let undeclaredDynamicSlot = false;
    /** Set when the edge reads a dynamic output the source never declared. */
    let undeclaredDynamicOutput = false;

    // A reserved handle like `__value__` is used by dynamic nodes and never
    // appears in static metadata.
    const isReservedHandle = (h: string): boolean =>
      h.startsWith("__") && h.endsWith("__");

    const sourceNode = this.builder.getNode(source);
    if (sourceNode) {
      const meta = this.registry.getMetadata(sourceNode.type);
      if (meta) {
        const output = meta.outputs.find(
          (o: NodeMetadata["outputs"][number]) => o.name === sourceHandle
        );
        // Dynamic-output nodes accept handles absent from static metadata;
        // mirror validateGraph and don't reject those (leave the type
        // undefined so the compatibility check is skipped).
        if (
          meta.outputs.length > 0 &&
          !output &&
          !meta.supports_dynamic_outputs &&
          !isReservedHandle(sourceHandle)
        ) {
          validationErrors.push(
            `Source node '${source}' (${sourceNode.type}) has no output '${sourceHandle}'. Available: ${meta.outputs.map((o: { name: string }) => o.name).join(", ")}`
          );
        } else if (output) {
          sourceType = typeMetaToString(output.type);
          sourceTypeMeta = output.type;
        } else if (isUndeclaredDynamicOutput(meta, sourceHandle)) {
          undeclaredDynamicOutput = !sourceNode.dynamic_outputs?.[sourceHandle];
        }
      }
    }

    const targetNode = this.builder.getNode(target);
    if (targetNode) {
      const meta = this.registry.getMetadata(targetNode.type);
      if (meta) {
        const input = meta.properties.find(
          (p: NodeMetadata["properties"][number]) => p.name === targetHandle
        );
        // Dynamic-input nodes accept handles absent from static metadata.
        if (
          meta.properties.length > 0 &&
          !input &&
          meta.supports_dynamic_inputs !== true &&
          !isReservedHandle(targetHandle)
        ) {
          validationErrors.push(
            `Target node '${target}' (${targetNode.type}) has no input '${targetHandle}'. Available: ${meta.properties.map((p: { name: string }) => p.name).join(", ")}`
          );
        } else if (input) {
          targetType = typeMetaToString(input.type);
        } else if (
          meta.supports_dynamic_inputs === true &&
          !isReservedHandle(targetHandle)
        ) {
          // Dynamic slot. A declared one is type-checked like any other input;
          // an undeclared one stays permissive and gets declared below from the
          // source output's type.
          const declared = slotTypeToString(
            targetNode.dynamic_inputs?.[targetHandle]
          );
          if (declared) targetType = declared;
          else undeclaredDynamicSlot = true;
        }
      }
    }

    // Type compatibility: catch e.g. a string output wired into a boolean
    // condition during planning, instead of only at runtime where the agent
    // can no longer self-correct. Skips unknown/any types and dynamic
    // endpoints, so it never blocks on missing metadata.
    if (
      validationErrors.length === 0 &&
      !edgeTypesCompatible(sourceType, targetType)
    ) {
      validationErrors.push(
        `Type mismatch: ${source}.${sourceHandle} outputs "${sourceType}" but ` +
          `${target}.${targetHandle} expects "${targetType}". Pick a node whose ` +
          `output type matches, or insert a converter.`
      );
    }

    if (validationErrors.length > 0) {
      return { status: "error", errors: validationErrors };
    }

    const errors = this.builder.addEdge(
      source,
      sourceHandle,
      target,
      targetHandle
    );
    if (errors.length > 0) {
      return { status: "error", errors };
    }

    // Give the new slot the source output's type, so later edges and inline
    // values on the same handle are checked instead of silently accepted.
    // Untypable sources leave the slot undeclared, i.e. `any` as before.
    let declaredType: string | undefined;
    if (undeclaredDynamicSlot && sourceTypeMeta && sourceType) {
      this.builder.declareDynamicInput(target, targetHandle, {
        type: toSlotTypeRecord(sourceTypeMeta)
      });
      declaredType = sourceType;
    }

    // An outgoing edge declares the source's dynamic output handle, the way an
    // incoming edge declares a dynamic input. The type stays `any`: the source
    // metadata does not carry one, and the target's expectation is not it.
    if (undeclaredDynamicOutput) {
      this.builder.declareDynamicOutput(
        source,
        sourceHandle,
        UNTYPED_SLOT_TYPE
      );
    }

    return {
      status: "edge_added",
      ...(declaredType ? { declared_dynamic_input: declaredType } : {}),
      ...(undeclaredDynamicOutput ? { declared_dynamic_output: true } : {}),
      from: `${source}.${sourceHandle}`,
      to: `${target}.${targetHandle}`,
      total_edges: this.builder.edgeCount
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Connecting ${params["source"]}.${params["source_handle"]} → ${params["target"]}.${params["target_handle"]}`;
  }
}
