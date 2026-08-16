import type { NodeMetadata, TypeMetadata } from "./metadata.js";

export interface WorkflowInterfaceGraphNode {
  id?: unknown;
  type?: unknown;
  data?: unknown;
  properties?: unknown;
  dynamic_properties?: unknown;
  dynamic_outputs?: unknown;
}

export interface WorkflowInterfaceGraphEdge {
  source?: unknown;
  sourceHandle?: unknown;
  source_handle?: unknown;
  target?: unknown;
  targetHandle?: unknown;
  target_handle?: unknown;
}

export interface WorkflowInterfaceGraph {
  nodes?: WorkflowInterfaceGraphNode[];
  edges?: WorkflowInterfaceGraphEdge[];
}

export interface WorkflowInterfaceRegistry {
  resolveMetadata(nodeType: string): NodeMetadata | undefined;
}

export interface WorkflowInterfaceDiagnostic {
  severity: "warning" | "error";
  code: string;
  message: string;
  node_id?: string;
  pin_name?: string;
}

export interface WorkflowInterfacePin {
  node_id: string;
  name: string;
  description: string;
  type: TypeMetadata;
}

export interface WorkflowInterfaceInput extends WorkflowInterfacePin {
  required: boolean;
  default: unknown;
  min?: number;
  max?: number;
}

export interface WorkflowInterfaceOutput extends WorkflowInterfacePin {
  stream: boolean;
}

export interface WorkflowInterfaceV1 {
  version: 1;
  workflow_id: string;
  etag: string | null;
  source: "server";
  inputs: WorkflowInterfaceInput[];
  outputs: WorkflowInterfaceOutput[];
  diagnostics: WorkflowInterfaceDiagnostic[];
}

const MAX_DEFAULT_JSON_BYTES = 16 * 1024;
const INPUT_PREFIX = "nodetool.input.";
const OUTPUT_TYPE = "nodetool.output.Output";
const DEDICATED_OUTPUT_TYPES: Readonly<Record<string, string>> = {
  "nodetool.output.ImageOutput": "image",
  "nodetool.output.AudioOutput": "audio",
  "nodetool.output.VideoOutput": "video"
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nodeProperties(
  node: WorkflowInterfaceGraphNode
): Record<string, unknown> {
  return {
    ...(record(node.properties) ?? record(node.data) ?? {}),
    ...(record(node.dynamic_properties) ?? {})
  };
}

function cloneType(type: TypeMetadata): TypeMetadata {
  const cloned: TypeMetadata = {
    type: type.type,
    optional: type.optional ?? false,
    type_args: (type.type_args ?? []).map(cloneType),
    type_name: type.type_name ?? null
  };
  if (type.values !== undefined) {
    cloned.values = [...type.values];
  }
  return cloned;
}

function anyType(): TypeMetadata {
  return { type: "any", optional: false, type_args: [], type_name: null };
}

function dedicatedOutputType(nodeType: string): TypeMetadata | null {
  const type = DEDICATED_OUTPUT_TYPES[nodeType];
  return type
    ? { type, optional: false, type_args: [], type_name: null }
    : null;
}

function pinText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function obviouslyExceedsDefaultBudget(value: unknown): boolean {
  let minimumBytes = 0;
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();

  while (pending.length > 0) {
    const current = pending.pop();
    if (current == null) {
      minimumBytes += 4;
    } else if (typeof current === "string") {
      // UTF-8 JSON needs at least one byte per UTF-16 code unit, plus quotes.
      minimumBytes += current.length + 2;
    } else if (typeof current === "number" || typeof current === "boolean") {
      minimumBytes += 1;
    } else if (typeof current === "object") {
      if (ArrayBuffer.isView(current)) {
        if (current.byteLength > MAX_DEFAULT_JSON_BYTES) return true;
      }
      if (seen.has(current)) continue;
      seen.add(current);
      const entries = Object.entries(current);
      minimumBytes += entries.length * 2;
      for (const [key, child] of entries) {
        minimumBytes += key.length + 3;
        pending.push(child);
      }
    }

    if (minimumBytes > MAX_DEFAULT_JSON_BYTES) return true;
  }

  return false;
}

/** A JSON round-trippable value — what a discovered default is reduced to. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function safeDefault(
  value: unknown,
  nodeId: string,
  pinName: string,
  diagnostics: WorkflowInterfaceDiagnostic[]
): JsonValue {
  if (value === undefined) return null;

  if (obviouslyExceedsDefaultBudget(value)) {
    diagnostics.push({
      severity: "warning",
      code: "default_too_large",
      message: `Default value for input '${pinName}' exceeds ${MAX_DEFAULT_JSON_BYTES} bytes and was omitted from discovery.`,
      node_id: nodeId,
      pin_name: pinName
    });
    return null;
  }

  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    diagnostics.push({
      severity: "warning",
      code: "default_not_serializable",
      message: `Default value for input '${pinName}' is not serializable and was omitted.`,
      node_id: nodeId,
      pin_name: pinName
    });
    return null;
  }

  if (json === undefined) {
    diagnostics.push({
      severity: "warning",
      code: "default_not_serializable",
      message: `Default value for input '${pinName}' is not JSON serializable and was omitted.`,
      node_id: nodeId,
      pin_name: pinName
    });
    return null;
  }

  if (new TextEncoder().encode(json).byteLength > MAX_DEFAULT_JSON_BYTES) {
    diagnostics.push({
      severity: "warning",
      code: "default_too_large",
      message: `Default value for input '${pinName}' exceeds ${MAX_DEFAULT_JSON_BYTES} bytes and was omitted from discovery.`,
      node_id: nodeId,
      pin_name: pinName
    });
    return null;
  }
  const normalized: JsonValue = JSON.parse(json);
  return normalized;
}

function outputTypeForNode(
  node: WorkflowInterfaceGraphNode,
  handle: string,
  registry: WorkflowInterfaceRegistry
): { type: TypeMetadata; stream: boolean } | null {
  const dynamic = record(node.dynamic_outputs);
  const dynamicType = record(dynamic?.[handle]);
  if (dynamicType && typeof dynamicType.type === "string") {
    return {
      type: cloneType(dynamicType as unknown as TypeMetadata),
      stream: false
    };
  }

  const nodeType = typeof node.type === "string" ? node.type : "";
  const metadata = registry.resolveMetadata(nodeType);
  const slot = metadata?.outputs.find((output) => output.name === handle);
  return slot
    ? { type: cloneType(slot.type), stream: slot.stream ?? false }
    : null;
}

export function deriveWorkflowInterfaceV1(args: {
  workflowId: string;
  etag?: string | null;
  graph: WorkflowInterfaceGraph;
  registry: WorkflowInterfaceRegistry;
}): WorkflowInterfaceV1 {
  const diagnostics: WorkflowInterfaceDiagnostic[] = [];
  const inputs: WorkflowInterfaceInput[] = [];
  const outputs: WorkflowInterfaceOutput[] = [];
  const nodes = Array.isArray(args.graph.nodes) ? args.graph.nodes : [];
  const edges = Array.isArray(args.graph.edges) ? args.graph.edges : [];
  const nodesById = new Map<string, WorkflowInterfaceGraphNode>();
  const inputNames = new Set<string>();
  const outputNames = new Set<string>();

  for (const node of nodes) {
    if (typeof node.id === "string") nodesById.set(node.id, node);
  }

  for (const node of nodes) {
    const nodeId = typeof node.id === "string" ? node.id : "";
    const nodeType = typeof node.type === "string" ? node.type : "";
    if (!nodeType.startsWith(INPUT_PREFIX)) continue;
    const props = nodeProperties(node);
    const name = pinText(props.name) || nodeId;
    if (!nodeId || !name) {
      diagnostics.push({
        severity: "error",
        code: "invalid_input_identity",
        message: "Workflow input is missing a stable node id or public name.",
        node_id: nodeId || undefined
      });
      continue;
    }
    if (inputNames.has(name)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate_input_name",
        message: `Workflow input name '${name}' is duplicated.`,
        node_id: nodeId,
        pin_name: name
      });
      continue;
    }
    inputNames.add(name);

    const resolved = outputTypeForNode(node, "output", args.registry);
    if (!resolved) {
      diagnostics.push({
        severity: "error",
        code: "unresolved_input_type",
        message: `Cannot resolve the output type for workflow input '${name}' (${nodeType}).`,
        node_id: nodeId,
        pin_name: name
      });
    }
    const type = resolved?.type ?? anyType();
    if (nodeType === "nodetool.input.SelectInput") {
      const options = Array.isArray(props.options)
        ? props.options.filter(
            (value): value is string | number =>
              typeof value === "string" || typeof value === "number"
          )
        : [];
      if (options.length > 0) type.values = options;
      const enumName = pinText(props.enum_type_name);
      if (enumName) type.type_name = enumName;
    }

    const input: WorkflowInterfaceInput = {
      node_id: nodeId,
      name,
      description: pinText(props.description),
      required: !type.optional,
      default: safeDefault(props.value, nodeId, name, diagnostics),
      type
    };
    if (typeof props.min === "number" && Number.isFinite(props.min))
      input.min = props.min;
    if (typeof props.max === "number" && Number.isFinite(props.max))
      input.max = props.max;
    inputs.push(input);
  }

  for (const node of nodes) {
    const nodeId = typeof node.id === "string" ? node.id : "";
    const nodeType = typeof node.type === "string" ? node.type : "";
    const dedicatedType = dedicatedOutputType(nodeType);
    if (nodeType !== OUTPUT_TYPE && !dedicatedType) continue;
    const props = nodeProperties(node);
    const name = pinText(props.name) || nodeId;
    if (!nodeId || !name) {
      diagnostics.push({
        severity: "error",
        code: "invalid_output_identity",
        message: "Workflow output is missing a stable node id or public name.",
        node_id: nodeId || undefined
      });
      continue;
    }
    if (outputNames.has(name)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate_output_name",
        message: `Workflow output name '${name}' is duplicated.`,
        node_id: nodeId,
        pin_name: name
      });
      continue;
    }
    outputNames.add(name);

    let resolved: { type: TypeMetadata; stream: boolean } | null = dedicatedType
      ? { type: dedicatedType, stream: false }
      : null;
    let incoming: WorkflowInterfaceGraphEdge[] = [];
    if (!dedicatedType) {
      incoming = edges.filter(
        (edge) =>
          edge.target === nodeId &&
          String(edge.targetHandle ?? edge.target_handle ?? "") === "value"
      );
      if (incoming.length === 1) {
        const edge = incoming[0]!;
        const source =
          typeof edge.source === "string"
            ? nodesById.get(edge.source)
            : undefined;
        const handle = String(edge.sourceHandle ?? edge.source_handle ?? "");
        if (!source) {
          diagnostics.push({
            severity: "error",
            code: "missing_source_node",
            message: `Workflow output '${name}' references a source node that is not present in the graph.`,
            node_id: nodeId,
            pin_name: name
          });
        } else if (!handle) {
          diagnostics.push({
            severity: "error",
            code: "missing_source_handle",
            message: `Workflow output '${name}' has an incoming edge without a source handle.`,
            node_id: nodeId,
            pin_name: name
          });
        } else {
          resolved = outputTypeForNode(source, handle, args.registry);
          if (!resolved) {
            const dynamic = record(source.dynamic_outputs);
            const hasDynamicHandle = record(dynamic?.[handle]) !== null;
            const sourceType =
              typeof source.type === "string" ? source.type : "";
            const sourceMetadata = args.registry.resolveMetadata(sourceType);
            diagnostics.push({
              severity: "error",
              code:
                !hasDynamicHandle && !sourceMetadata
                  ? "missing_node_metadata"
                  : "missing_output_handle",
              message:
                !hasDynamicHandle && !sourceMetadata
                  ? `Node metadata for workflow output source '${sourceType}' is unavailable. The node pack may be disabled or not loaded.`
                  : `Source handle '${handle}' is not declared by node '${sourceType}'.`,
              node_id: typeof source.id === "string" ? source.id : nodeId,
              pin_name: handle
            });
          }
        }
      }
    }
    if (!resolved) {
      diagnostics.push({
        severity: "error",
        code:
          incoming.length > 1
            ? "ambiguous_output_source"
            : "unresolved_output_type",
        message: `Cannot resolve a unique source type for workflow output '${name}'.`,
        node_id: nodeId,
        pin_name: name
      });
    }
    outputs.push({
      node_id: nodeId,
      name,
      description: pinText(props.description),
      type: resolved?.type ?? anyType(),
      stream: resolved?.stream ?? false
    });
  }

  return {
    version: 1,
    workflow_id: args.workflowId,
    etag: args.etag ?? null,
    source: "server",
    inputs,
    outputs,
    diagnostics
  };
}
