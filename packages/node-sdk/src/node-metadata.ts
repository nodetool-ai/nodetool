/**
 * Node metadata introspection.
 *
 * TS classes are authoritative when no Python metadata is loaded. When Python
 * metadata is available for a node, registry-emitted metadata should match the
 * Python package JSON exactly so downstream consumers see a stable shape.
 */

import type { NodeClass } from "./base-node.js";
import type { NodeMetadata, OutputSlotMetadata, PropertyMetadata, TypeMetadata } from "./metadata.js";
import type { DeclaredPropertyMetadata } from "./decorators.js";

export interface GetNodeMetadataOptions {
  pythonMetadata?: NodeMetadata;
  mergePythonBackfill?: boolean;
}

function mapScalarTypeName(typeName: string): string {
  const normalized = typeName.trim().toLowerCase();
  if (normalized === "string") return "str";
  if (normalized === "integer") return "int";
  if (normalized === "boolean") return "bool";
  if (normalized === "number") return "float";
  return normalized || "any";
}

function parseTypeString(typeName: string): TypeMetadata {
  const trimmed = typeName.trim();
  if (!trimmed) return { type: "any", type_args: [] };

  const firstBracket = trimmed.indexOf("[");
  if (firstBracket < 0 || !trimmed.endsWith("]")) {
    return { type: mapScalarTypeName(trimmed), type_args: [] };
  }

  const base = mapScalarTypeName(trimmed.slice(0, firstBracket));
  const inner = trimmed.slice(firstBracket + 1, -1).trim();
  if (!inner) return { type: base, type_args: [] };

  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "[") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === "]") {
      depth--;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  return {
    type: base,
    type_args: parts.map(parseTypeString),
  };
}

function deriveNamespace(nodeType: string): string {
  const lastDot = nodeType.lastIndexOf(".");
  return lastDot > 0 ? nodeType.slice(0, lastDot) : "";
}

function toMetadataType(typeMeta: TypeMetadata): TypeMetadata {
  return {
    ...typeMeta,
    type: mapScalarTypeName(typeMeta.type),
    type_args: (typeMeta.type_args ?? []).map(toMetadataType),
  };
}

function cloneTypeMetadata(typeMeta: TypeMetadata): TypeMetadata {
  return {
    ...typeMeta,
    type_args: (typeMeta.type_args ?? []).map(cloneTypeMetadata),
  };
}

function clonePropertyMetadata(prop: PropertyMetadata): PropertyMetadata {
  const cloned: PropertyMetadata = {
    ...prop,
    type: cloneTypeMetadata(prop.type),
  };
  if (Object.prototype.hasOwnProperty.call(prop, "default")) {
    cloned.default = prop.default;
  }
  return cloned;
}

function cloneOutputMetadata(output: OutputSlotMetadata): OutputSlotMetadata {
  return {
    ...output,
    type: cloneTypeMetadata(output.type),
  };
}

function mergeMetadata(tsMetadata: NodeMetadata, pyMetadata?: NodeMetadata): NodeMetadata {
  if (!pyMetadata) return tsMetadata;
  return {
    ...pyMetadata,
    properties: (pyMetadata.properties ?? []).map(clonePropertyMetadata),
    outputs: (pyMetadata.outputs ?? []).map(cloneOutputMetadata),
  };
}

function getDecoratedProperties(nodeClass: NodeClass): PropertyMetadata[] {
  return nodeClass.getDeclaredProperties().map((entry) => {
    const opts = (entry as DeclaredPropertyMetadata).options;
    const result: PropertyMetadata = {
      name: entry.name,
      type: parseTypeString(opts.type),
      required: opts.required ?? false,
      title: opts.title,
      description: opts.description,
      min: opts.min,
      max: opts.max,
      values: opts.values,
      json_schema_extra: opts.json_schema_extra,
    };
    if (Object.prototype.hasOwnProperty.call(opts, "default")) {
      result.default = opts.default;
    }
    return result;
  });
}

function getOutputs(nodeClass: NodeClass): OutputSlotMetadata[] {
  const outputs: OutputSlotMetadata[] = [];
  const declared = nodeClass.metadataOutputTypes ?? nodeClass.getDeclaredOutputs();

  if (Object.keys(declared).length > 0) {
    for (const [name, typeName] of Object.entries(declared)) {
      outputs.push({
        name,
        type: parseTypeString(typeName),
      });
    }
    return outputs;
  }

  const descriptor = nodeClass.toDescriptor();
  if (descriptor.outputs && Object.keys(descriptor.outputs).length > 0) {
    for (const [name, typeName] of Object.entries(descriptor.outputs)) {
      outputs.push({
        name,
        type: parseTypeString(typeName),
      });
    }
  }
  return outputs;
}

export function getNodeMetadata(nodeClass: NodeClass, options: GetNodeMetadataOptions = {}): NodeMetadata {
  const nodeType = nodeClass.nodeType;
  const namespace = deriveNamespace(nodeType);
  const properties = getDecoratedProperties(nodeClass).map((p) => ({ ...p, type: toMetadataType(p.type) }));
  const outputs = getOutputs(nodeClass).map((o) => ({ ...o, type: toMetadataType(o.type) }));

  const tsMetadata: NodeMetadata = {
    title: nodeClass.title || nodeType,
    description: nodeClass.description || "",
    namespace,
    node_type: nodeType,
    layout: nodeClass.layout,
    properties,
    outputs,
    the_model_info: nodeClass.theModelInfo,
    recommended_models: nodeClass.recommendedModels,
    basic_fields: nodeClass.basicFields ?? properties.map((property) => property.name),
    required_settings: nodeClass.requiredSettings,
    is_streaming_output: nodeClass.isStreamingOutput || false,
    is_dynamic: nodeClass.isDynamic || false,
    expose_as_tool: nodeClass.exposeAsTool,
    supports_dynamic_outputs: nodeClass.supportsDynamicOutputs,
    model_packs: nodeClass.modelPacks,
  };

  if (!options.mergePythonBackfill) {
    return tsMetadata;
  }

  return mergeMetadata(tsMetadata, options.pythonMetadata);
}

export function getNodeMetadataBatch(
  nodeClasses: NodeClass[],
  options: GetNodeMetadataOptions = {}
): NodeMetadata[] {
  return nodeClasses.map((nodeClass) => getNodeMetadata(nodeClass, options));
}
