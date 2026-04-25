/**
 * Node metadata introspection.
 *
 * TS classes are authoritative when no Python metadata is loaded. When Python
 * metadata is available for a node, registry-emitted metadata should match the
 * Python package JSON exactly so downstream consumers see a stable shape.
 */

import type { NodeClass } from "./base-node.js";
import type {
  NodeMetadata,
  OutputSlotMetadata,
  PropertyMetadata,
  TypeMetadata
} from "./metadata.js";
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
    type_args: parts.map(parseTypeString)
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
    type_args: (typeMeta.type_args ?? []).map(toMetadataType)
  };
}

function cloneTypeMetadata(typeMeta: TypeMetadata): TypeMetadata {
  return {
    ...typeMeta,
    type_args: (typeMeta.type_args ?? []).map(cloneTypeMetadata)
  };
}

function clonePropertyMetadata(prop: PropertyMetadata): PropertyMetadata {
  const cloned: PropertyMetadata = {
    ...prop,
    type: cloneTypeMetadata(prop.type)
  };
  if (Object.prototype.hasOwnProperty.call(prop, "default")) {
    cloned.default = prop.default;
  }
  return cloned;
}

function cloneOutputMetadata(output: OutputSlotMetadata): OutputSlotMetadata {
  return {
    ...output,
    type: cloneTypeMetadata(output.type)
  };
}

function mergeMetadata(
  tsMetadata: NodeMetadata,
  pyMetadata?: NodeMetadata
): NodeMetadata {
  if (!pyMetadata) return tsMetadata;

  // TS class definitions are authoritative. Python metadata is used only to
  // backfill fields that the TS introspection does not populate (e.g.
  // layout, model_packs) and to enrich property descriptions/defaults when
  // the TS class omits them.
  const tsProps = new Map(tsMetadata.properties.map((p) => [p.name, p]));
  const mergedProperties: PropertyMetadata[] = tsMetadata.properties.map(
    (tsProp) => {
      const pyProp = pyMetadata.properties?.find((p) => p.name === tsProp.name);
      if (!pyProp) return tsProp;
      // Backfill description and title from Python if TS doesn't set them
      return {
        ...tsProp,
        description: tsProp.description ?? pyProp.description,
        title: tsProp.title ?? pyProp.title
      };
    }
  );

  // Append Python-only properties that don't exist in TS (rare, but keeps
  // backward compatibility for dynamic properties not declared via @prop).
  for (const pyProp of pyMetadata.properties ?? []) {
    if (!tsProps.has(pyProp.name)) {
      mergedProperties.push(clonePropertyMetadata(pyProp));
    }
  }

  return {
    ...tsMetadata,
    properties: mergedProperties,
    outputs:
      tsMetadata.outputs.length > 0
        ? tsMetadata.outputs
        : (pyMetadata.outputs ?? []).map(cloneOutputMetadata),
    // Backfill optional fields from Python when TS doesn't set them
    layout: tsMetadata.layout ?? pyMetadata.layout,
    model_packs: tsMetadata.model_packs ?? pyMetadata.model_packs
  };
}

function getDecoratedProperties(nodeClass: NodeClass): PropertyMetadata[] {
  return nodeClass.getDeclaredProperties().map((entry) => {
    const opts = (entry as DeclaredPropertyMetadata).options;
    const type = parseTypeString(opts.type);
    // Attach enum values to TypeMetadata so the frontend can detect them
    if (opts.values?.length) {
      type.values = opts.values;
    }
    const result: PropertyMetadata = {
      name: entry.name,
      type,
      required: opts.required ?? false,
      title: opts.title,
      description: opts.description,
      min: opts.min,
      max: opts.max,
      values: opts.values,
      json_schema_extra: opts.json_schema_extra
    };
    if (Object.prototype.hasOwnProperty.call(opts, "default")) {
      result.default = opts.default;
    }
    return result;
  });
}

function getOutputs(nodeClass: NodeClass): OutputSlotMetadata[] {
  const outputs: OutputSlotMetadata[] = [];
  const declared =
    nodeClass.metadataOutputTypes ?? nodeClass.getDeclaredOutputs();

  if (Object.keys(declared).length > 0) {
    for (const [name, typeName] of Object.entries(declared)) {
      outputs.push({
        name,
        type: parseTypeString(typeName)
      });
    }
    return outputs;
  }

  const descriptor = nodeClass.toDescriptor();
  if (descriptor.outputs && Object.keys(descriptor.outputs).length > 0) {
    for (const [name, typeName] of Object.entries(
      descriptor.outputs as Record<string, string>
    )) {
      outputs.push({
        name,
        type: parseTypeString(typeName)
      });
    }
  }
  return outputs;
}

/** Media/data types that represent primary node inputs (not tuning parameters). */
const PRIMARY_INPUT_TYPES = new Set([
  "image",
  "video",
  "audio",
  "text",
  "str",
  "dataframe",
  "tensor",
  "folder",
  "thread",
  "thread_message",
  "task",
  "workflow",
  "agent",
  "any"
]);

/** Type-name prefixes that mark a prop as a model-selector and therefore primary. */
const PRIMARY_TYPE_PREFIXES = ["tjs."];

function isPrimaryType(typeName: string): boolean {
  if (PRIMARY_INPUT_TYPES.has(typeName)) return true;
  return PRIMARY_TYPE_PREFIXES.some((prefix) => typeName.startsWith(prefix));
}

/**
 * When a node doesn't explicitly set basicFields, derive them:
 * - Nodes with ≤3 properties: show all
 * - Nodes with >3 properties: primary inputs (media/data types,
 *   model-selector types like `tjs.*`) and required props are basic;
 *   scalar tuning params are advanced.
 * - If heuristic produces no basic or no advanced fields, show all.
 */
function deriveBasicFields(properties: PropertyMetadata[]): string[] {
  const allNames = properties.map((p) => p.name);
  if (properties.length <= 3) return allNames;

  const basic = properties
    .filter(
      (p) => p.required || isPrimaryType(p.type.type)
    )
    .map((p) => p.name);

  // If heuristic is unhelpful (all or none are basic), show everything
  if (basic.length === 0 || basic.length >= properties.length) {
    return allNames;
  }
  return basic;
}

export function getNodeMetadata(
  nodeClass: NodeClass,
  options: GetNodeMetadataOptions = {}
): NodeMetadata {
  const nodeType = nodeClass.nodeType;
  const namespace = deriveNamespace(nodeType);
  const properties = getDecoratedProperties(nodeClass).map((p) => ({
    ...p,
    type: toMetadataType(p.type)
  }));
  const outputs = getOutputs(nodeClass).map((o) => ({
    ...o,
    type: toMetadataType(o.type)
  }));

  const tsMetadata: NodeMetadata = {
    title: nodeClass.title || nodeType,
    description: nodeClass.description || "",
    namespace,
    node_type: nodeType,
    layout: nodeClass.layout ?? "default",
    properties,
    outputs,

    recommended_models: nodeClass.recommendedModels ?? [],
    basic_fields:
      nodeClass.basicFields ??
      deriveBasicFields(properties),
    required_settings: nodeClass.requiredSettings ?? [],
    required_runtimes: nodeClass.requiredRuntimes ?? [],
    is_streaming_input: nodeClass.isStreamingInput || false,
    is_streaming_output: nodeClass.isStreamingOutput || false,
    is_controlled: nodeClass.isControlled || false,
    is_dynamic: nodeClass.isDynamic || false,
    expose_as_tool: nodeClass.exposeAsTool,
    supports_dynamic_outputs: nodeClass.supportsDynamicOutputs,
    auto_save_asset: nodeClass.autoSaveAsset || undefined,
    model_packs: nodeClass.modelPacks
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
