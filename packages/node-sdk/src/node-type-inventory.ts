import type { NodeMetadata, TypeMetadata } from "./metadata.js";
import type { NodeMetadataSource, NodeRegistry } from "./registry.js";

const MAX_TYPE_DEPTH = 8;
const MAX_ENUM_VALUES = 64;
const MAX_EXAMPLES = 5;
export const MAX_NODE_TYPE_INVENTORY_PAGE_SIZE = 100;

export interface NodeTypeInventoryOptions {
  cursor?: number;
  limit?: number;
  pythonBridgeReady?: boolean;
  unavailablePacks?: readonly NodePackAvailabilityDiagnostic[];
}

export interface NodePackAvailabilityDiagnostic {
  id: string;
  name: string;
  reason: string;
}

export interface NodeTypeUsageExample {
  node_type: string;
  pin: string;
  direction: "input" | "output";
}

export interface NodeTypeUsage {
  signature: string;
  type: string;
  type_name: string | null;
  optional: boolean;
  type_args: string[];
  values: Array<string | number>;
  values_truncated: boolean;
  input_uses: number;
  output_uses: number;
  node_count: number;
  sources: Partial<Record<NodeMetadataSource, number>>;
  examples: NodeTypeUsageExample[];
}

export interface NodeTypeInventory {
  version: 1;
  registry_revision: number;
  registry_ready: true;
  python_bridge_ready: boolean;
  node_count: number;
  type_count: number;
  provenance_counts: Partial<Record<NodeMetadataSource, number>>;
  cursor: number;
  next_cursor: number | null;
  types: NodeTypeUsage[];
  unavailable_packs: NodePackAvailabilityDiagnostic[];
}

interface MutableUsage {
  type: TypeMetadata;
  inputUses: number;
  outputUses: number;
  nodeTypes: Set<string>;
  sources: Partial<Record<NodeMetadataSource, number>>;
  examples: NodeTypeUsageExample[];
}

function boundedTypeArgs(type: TypeMetadata, depth: number): TypeMetadata[] {
  if (depth >= MAX_TYPE_DEPTH) return [];
  return (type.type_args ?? []).slice(0, MAX_TYPE_DEPTH);
}

function typeIdentity(type: TypeMetadata, depth = 0): string {
  const args = boundedTypeArgs(type, depth).map((arg) =>
    typeIdentity(arg, depth + 1)
  );
  return JSON.stringify([
    type.type,
    type.type_name ?? null,
    type.optional ?? false,
    type.values ?? [],
    args
  ]);
}

function typeSignature(type: TypeMetadata, depth = 0): string {
  const args = boundedTypeArgs(type, depth).map((arg) =>
    typeSignature(arg, depth + 1)
  );
  const generic = args.length > 0 ? `[${args.join(",")}]` : "";
  const named = type.type_name ? `:${type.type_name}` : "";
  const optional = type.optional ? "?" : "";
  return `${type.type}${generic}${named}${optional}`;
}

function incrementSource(
  counts: Partial<Record<NodeMetadataSource, number>>,
  source: NodeMetadataSource
): void {
  counts[source] = (counts[source] ?? 0) + 1;
}

function addTypeUsage(
  usageByIdentity: Map<string, MutableUsage>,
  type: TypeMetadata,
  nodeType: string,
  pin: string,
  direction: "input" | "output",
  source: NodeMetadataSource,
  depth = 0
): void {
  if (depth > MAX_TYPE_DEPTH) return;

  const identity = typeIdentity(type);
  let usage = usageByIdentity.get(identity);
  if (!usage) {
    usage = {
      type,
      inputUses: 0,
      outputUses: 0,
      nodeTypes: new Set<string>(),
      sources: {},
      examples: []
    };
    usageByIdentity.set(identity, usage);
  }

  if (direction === "input") usage.inputUses++;
  else usage.outputUses++;
  usage.nodeTypes.add(nodeType);
  incrementSource(usage.sources, source);
  if (usage.examples.length < MAX_EXAMPLES) {
    usage.examples.push({ node_type: nodeType, pin, direction });
  }

  for (const arg of boundedTypeArgs(type, depth)) {
    addTypeUsage(
      usageByIdentity,
      arg,
      nodeType,
      pin,
      direction,
      source,
      depth + 1
    );
  }
}

function collectNodeTypes(
  metadata: readonly NodeMetadata[],
  registry: NodeRegistry
) {
  const usageByIdentity = new Map<string, MutableUsage>();
  const provenanceCounts: Partial<Record<NodeMetadataSource, number>> = {};

  for (const node of metadata) {
    const source =
      registry.getMetadataSource(node.node_type) ?? "loaded-metadata";
    incrementSource(provenanceCounts, source);
    for (const property of node.properties ?? []) {
      addTypeUsage(
        usageByIdentity,
        property.type,
        node.node_type,
        property.name,
        "input",
        source
      );
    }
    for (const output of node.outputs ?? []) {
      addTypeUsage(
        usageByIdentity,
        output.type,
        node.node_type,
        output.name,
        "output",
        source
      );
    }
  }

  return { usageByIdentity, provenanceCounts };
}

function toTypeUsage(usage: MutableUsage): NodeTypeUsage {
  const values = usage.type.values ?? [];
  return {
    signature: typeSignature(usage.type),
    type: usage.type.type,
    type_name: usage.type.type_name ?? null,
    optional: usage.type.optional ?? false,
    type_args: boundedTypeArgs(usage.type, 0).map((arg) => typeSignature(arg)),
    values: values.slice(0, MAX_ENUM_VALUES),
    values_truncated: values.length > MAX_ENUM_VALUES,
    input_uses: usage.inputUses,
    output_uses: usage.outputUses,
    node_count: usage.nodeTypes.size,
    sources: usage.sources,
    examples: usage.examples
  };
}

/**
 * Build a compact, paginated view of every recursive pin type in the registry.
 * This is a usage catalog, not a structured-type schema catalog.
 */
export function buildNodeTypeInventory(
  registry: NodeRegistry,
  options: NodeTypeInventoryOptions = {}
): NodeTypeInventory {
  const metadata = registry
    .listMetadata()
    .sort((a, b) => a.node_type.localeCompare(b.node_type));
  const { usageByIdentity, provenanceCounts } = collectNodeTypes(
    metadata,
    registry
  );
  const allTypes = [...usageByIdentity.values()]
    .map(toTypeUsage)
    .sort((a, b) => a.signature.localeCompare(b.signature));
  const cursor = Math.max(0, options.cursor ?? 0);
  const limit = Math.min(
    Math.max(1, options.limit ?? MAX_NODE_TYPE_INVENTORY_PAGE_SIZE),
    MAX_NODE_TYPE_INVENTORY_PAGE_SIZE
  );
  const types = allTypes.slice(cursor, cursor + limit);
  const nextCursor =
    cursor + types.length < allTypes.length ? cursor + types.length : null;

  return {
    version: 1,
    registry_revision: registry.revision,
    registry_ready: true,
    python_bridge_ready: options.pythonBridgeReady ?? false,
    node_count: metadata.length,
    type_count: allTypes.length,
    provenance_counts: provenanceCounts,
    cursor,
    next_cursor: nextCursor,
    types,
    unavailable_packs: [...(options.unavailablePacks ?? [])]
  };
}
