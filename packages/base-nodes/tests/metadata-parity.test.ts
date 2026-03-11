import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool/node-sdk";
import { ALL_BASE_NODES, registerBaseNodes } from "../src/index.js";

function repoRootFromTestsDir(): string {
  return path.resolve(__dirname, "../../../../..");
}

function pythonMetadataRoots(): string[] {
  const repoRoot = repoRootFromTestsDir();
  return [
    path.resolve(repoRoot, "../nodetool-base"),
    repoRoot,
  ];
}

function typeToString(typeMeta: {
  type: string;
  type_args?: Array<{ type: string; type_args?: unknown[] }>;
}): string {
  const args = (typeMeta.type_args ?? []).map(typeToString).filter(Boolean);
  return args.length > 0 ? `${typeMeta.type}[${args.join(", ")}]` : typeMeta.type;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }
  return value;
}

function normalizeMetadata(metadata: NonNullable<ReturnType<NodeRegistry["getMetadata"]>>) {
  return {
    title: metadata.title,
    description: metadata.description,
    namespace: metadata.namespace,
    node_type: metadata.node_type,
    layout: metadata.layout ?? null,
    the_model_info: sortJson(metadata.the_model_info ?? null),
    recommended_models: sortJson(metadata.recommended_models ?? []),
    basic_fields: metadata.basic_fields ?? [],
    required_settings: metadata.required_settings ?? [],
    is_dynamic: metadata.is_dynamic ?? false,
    is_streaming_output: metadata.is_streaming_output ?? false,
    expose_as_tool: metadata.expose_as_tool ?? false,
    supports_dynamic_outputs: metadata.supports_dynamic_outputs ?? false,
    model_packs: sortJson(metadata.model_packs ?? []),
    properties: (metadata.properties ?? []).map((property) => ({
      name: property.name,
      type: typeToString(property.type),
      default: sortJson(property.default),
      title: property.title ?? null,
      description: property.description ?? null,
      min: property.min ?? null,
      max: property.max ?? null,
      values: property.values ?? property.type.values ?? null,
      required: property.required ?? false,
      json_schema_extra: sortJson(property.json_schema_extra ?? null),
    })),
    outputs: (metadata.outputs ?? []).map((output) => ({
      name: output.name,
      type: typeToString(output.type),
      stream: output.stream ?? false,
    })),
  };
}

const TS_ONLY_NODE_TYPES = [
  "nodetool.workflows.base_node.Preview",
] as const;

describe("Python metadata parity", () => {
  it("loads Python package metadata from nodetool-base", () => {
    const registry = new NodeRegistry();
    const loaded = registry.loadPythonMetadata({
      roots: pythonMetadataRoots(),
      maxDepth: 7,
    });

    expect(loaded.files.length).toBeGreaterThan(0);
    expect(loaded.nodesByType.size).toBeGreaterThan(0);
    expect(
      loaded.files.some((file) => file.endsWith("/nodetool-base/src/nodetool/package_metadata/nodetool-base.json")),
    ).toBe(true);
  });

  it("keeps TS base-node metadata aligned with Python metadata", () => {
    const registry = new NodeRegistry({ strictMetadata: true });
    const loaded = registry.loadPythonMetadata({
      roots: pythonMetadataRoots(),
      maxDepth: 7,
    });
    registerBaseNodes(registry);

    const missingPythonNodeTypes: string[] = [];
    const overlappingNodeTypes: string[] = [];

    for (const NodeClass of ALL_BASE_NODES) {
      const tsMetadata = registry.getMetadata(NodeClass.nodeType);
      expect(tsMetadata, `Missing metadata for ${NodeClass.nodeType}`).toBeDefined();
      if (!tsMetadata) continue;

      const expectedPythonNodeType = NodeClass.nodeType.endsWith("Node")
        ? NodeClass.nodeType.slice(0, -4)
        : NodeClass.nodeType;
      const pythonMetadata =
        loaded.nodesByType.get(NodeClass.nodeType) ?? loaded.nodesByType.get(expectedPythonNodeType);

      if (!pythonMetadata || ![NodeClass.nodeType, expectedPythonNodeType].includes(pythonMetadata.node_type)) {
        missingPythonNodeTypes.push(NodeClass.nodeType);
        continue;
      }
      overlappingNodeTypes.push(NodeClass.nodeType);
      expect(normalizeMetadata(tsMetadata)).toEqual(normalizeMetadata(pythonMetadata));
    }

    expect(missingPythonNodeTypes).toEqual(TS_ONLY_NODE_TYPES);
    expect(overlappingNodeTypes.length).toBe(ALL_BASE_NODES.length - TS_ONLY_NODE_TYPES.length);
  });
});
