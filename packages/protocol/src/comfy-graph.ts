/**
 * Comfy workflows: NodeTool graphs whose nodes are ComfyUI node classes.
 *
 * A workflow with `run_mode: "comfy"` is edited in the NodeTool graph editor
 * but never runs node by node in the NodeTool kernel. The whole graph is
 * compiled to ComfyUI's API ("prompt") format and submitted as one job to
 * Comfy Cloud through the Comfy API v2. This module holds the pure parts of
 * that path, shared by the server and the web client:
 *
 * - {@link comfyObjectInfoToMetadata} turns ComfyUI's `/api/object_info`
 *   catalog into NodeTool node metadata, one `comfy.<ClassName>` type per
 *   ComfyUI node class, so the editor can place and wire them.
 * - {@link buildComfyPrompt} compiles a NodeTool graph of `comfy.*` nodes to
 *   an API-format prompt. Prompt keys are the NodeTool node ids, so progress
 *   Comfy reports for a prompt node maps straight back to the editor node.
 * - {@link comfyPromptToGraph} imports an API-format prompt as a graph.
 * - {@link collapseComfyGraph} replaces a Comfy graph with the single runner
 *   node the kernel executes.
 */

import type { NodeMetadata, OutputSlot, Property, PropertyTypeMetadata } from "./api-types.js";

/** The run mode that marks a workflow as a Comfy workflow. */
export const COMFY_RUN_MODE = "comfy";

/** Node type prefix of ComfyUI node classes in a NodeTool graph. */
export const COMFY_NODE_PREFIX = "comfy.";

/** Edge type prefix of ComfyUI's typed sockets (MODEL, LATENT, IMAGE, ...). */
export const COMFY_SOCKET_PREFIX = "comfy.";

/**
 * The runner node {@link collapseComfyGraph} substitutes for a Comfy graph. It
 * is registered by `@nodetool-ai/integration-nodes` and hidden from the menu.
 */
export const COMFY_CLOUD_GRAPH_NODE_TYPE = "lib.comfy.RunComfyGraphOnCloud";

/** Node id of the substituted runner node. */
export const COMFY_CLOUD_GRAPH_NODE_ID = "__comfy_cloud_graph__";

/** One entry of ComfyUI's `/api/object_info`. Only the fields read here. */
export interface ComfyObjectInfoEntry {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
    hidden?: Record<string, unknown>;
  };
  input_order?: { required?: string[]; optional?: string[] };
  output?: unknown[];
  output_name?: string[];
  output_is_list?: boolean[];
  name?: string;
  display_name?: string;
  description?: string;
  category?: string;
  output_node?: boolean;
  deprecated?: boolean;
  experimental?: boolean;
  api_node?: boolean;
}

export type ComfyObjectInfo = Record<string, ComfyObjectInfoEntry>;

/** A ComfyUI workflow in API ("prompt") format. */
export type ComfyApiPrompt = Record<
  string,
  { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
>;

/** The graph shape these helpers read and write (saved or normalized form). */
export interface ComfyGraphNode {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
  properties?: Record<string, unknown> | null;
  ui_properties?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ComfyGraphEdge {
  id?: string | null;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  [key: string]: unknown;
}

export interface ComfyGraph {
  nodes: ComfyGraphNode[];
  edges: ComfyGraphEdge[];
}

const PRIMITIVES: Record<string, string> = {
  INT: "int",
  FLOAT: "float",
  STRING: "str",
  BOOLEAN: "bool"
};

const EDITOR_ONLY_TYPES = new Set([
  "nodetool.workflows.base_node.Comment",
  "nodetool.workflows.base_node.Group",
  "nodetool.workflows.base_node.Preview",
  "nodetool.control.Reroute"
]);

export function isComfyNodeType(type: unknown): type is string {
  return typeof type === "string" && type.startsWith(COMFY_NODE_PREFIX);
}

/** The ComfyUI class name behind a `comfy.<ClassName>` node type. */
export function comfyClassType(nodeType: string): string {
  return nodeType.slice(COMFY_NODE_PREFIX.length);
}

/**
 * True when every runnable node of the graph is a ComfyUI node class. Editor
 * annotations (comments, groups, previews) do not count either way.
 */
export function isComfyGraph(graph: { nodes: ReadonlyArray<{ type?: unknown }> }): boolean {
  let comfy = 0;
  for (const node of graph.nodes) {
    if (typeof node.type === "string" && EDITOR_ONLY_TYPES.has(node.type)) continue;
    if (!isComfyNodeType(node.type)) return false;
    comfy += 1;
  }
  return comfy > 0;
}

function socketType(name: string): PropertyTypeMetadata {
  if (name === "*" || name.includes(",")) {
    return { type: "any", optional: true, type_args: [] };
  }
  return { type: `${COMFY_SOCKET_PREFIX}${name}`, optional: true, type_args: [] };
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumProperty(
  name: string,
  values: Array<string | number>,
  opts: Record<string, unknown>,
  required: boolean
): Property {
  const fallback = values[0] ?? "";
  const def = opts.default;
  return {
    name,
    type: { type: "enum", optional: !required, values, type_args: [] },
    default:
      typeof def === "string" || typeof def === "number" ? def : fallback,
    title: name,
    description: typeof opts.tooltip === "string" ? opts.tooltip : null,
    values,
    required
  };
}

/**
 * Properties for one ComfyUI input. A dynamic combo (`COMFY_DYNAMICCOMBO_V3`)
 * is an enum of its option keys plus the inputs of its default option,
 * flattened, which is how the API format carries them (`format`, `codec`).
 */
function inputProperties(
  name: string,
  spec: unknown,
  required: boolean,
  depth = 0
): Property[] {
  if (!Array.isArray(spec) || spec.length === 0) return [];
  const kind = spec[0];
  const opts = isRecord(spec[1]) ? spec[1] : {};
  const description = typeof opts.tooltip === "string" ? opts.tooltip : null;

  if (Array.isArray(kind)) {
    const values = kind.filter(
      (v): v is string | number => typeof v === "string" || typeof v === "number"
    );
    return [enumProperty(name, values, opts, required)];
  }
  if (typeof kind !== "string") return [];

  if (kind === "COMBO" && Array.isArray(opts.options)) {
    const values = opts.options.filter(
      (v): v is string | number => typeof v === "string" || typeof v === "number"
    );
    return [enumProperty(name, values, opts, required)];
  }

  if (kind === "COMFY_DYNAMICCOMBO_V3" && Array.isArray(opts.options)) {
    const options = opts.options.filter(isRecord);
    const keys = options
      .map((o) => o.key)
      .filter((k): k is string => typeof k === "string");
    const out = [enumProperty(name, keys, opts, required)];
    const selected = String(opts.default ?? keys[0] ?? "");
    const chosen = options.find((o) => o.key === selected);
    const nested = isRecord(chosen?.inputs) ? chosen.inputs : {};
    if (depth < 3) {
      for (const section of ["required", "optional"] as const) {
        const group = nested[section];
        if (!isRecord(group)) continue;
        for (const [child, childSpec] of Object.entries(group)) {
          out.push(
            ...inputProperties(child, childSpec, section === "required" && required, depth + 1)
          );
        }
      }
    }
    return out;
  }

  const primitive = PRIMITIVES[kind];
  if (primitive) {
    let def: unknown = opts.default;
    if (def === undefined) {
      def = primitive === "str" ? "" : primitive === "bool" ? false : primitive === "int" || primitive === "float" ? (safeNumber(opts.min) ?? 0) : null;
    }
    if ((primitive === "int" || primitive === "float") && safeNumber(def) === null) {
      def = 0;
    }
    const extra: Record<string, unknown> = {};
    if (opts.multiline === true) extra.multiline = true;
    if (typeof opts.step === "number") extra.step = opts.step;
    return [
      {
        name,
        type: { type: primitive, optional: !required, type_args: [] },
        default: def,
        title: name,
        description,
        min: safeNumber(opts.min),
        max: safeNumber(opts.max),
        json_schema_extra: Object.keys(extra).length > 0 ? extra : null,
        required
      }
    ];
  }

  return [
    {
      name,
      type: socketType(kind),
      default: null,
      title: name,
      description,
      required
    }
  ];
}

/**
 * Output slot names for a ComfyUI class, deduplicated in socket order. The
 * index of a name in this list is the socket index the API format links by.
 */
export function comfyOutputNames(entry: ComfyObjectInfoEntry): string[] {
  const types = Array.isArray(entry.output) ? entry.output : [];
  const names = Array.isArray(entry.output_name) ? entry.output_name : [];
  const seen = new Map<string, number>();
  return types.map((type, index) => {
    const base = String(names[index] ?? (typeof type === "string" ? type : `output_${index}`));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function namespaceFor(category: string | undefined): string {
  const parts = (category ?? "")
    .split("/")
    .map((p) => p.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
    .filter((p) => p.length > 0);
  return ["comfy", ...(parts.length > 0 ? parts : ["other"])].join(".");
}

function orderedInputs(
  entry: ComfyObjectInfoEntry,
  section: "required" | "optional"
): Array<[string, unknown]> {
  const group = entry.input?.[section];
  if (!isRecord(group)) return [];
  const order = entry.input_order?.[section];
  const names = Array.isArray(order) && order.length > 0 ? order : Object.keys(group);
  return names.filter((n) => n in group).map((n) => [n, group[n]]);
}

/** NodeTool metadata for one ComfyUI node class. */
export function comfyEntryToMetadata(
  className: string,
  entry: ComfyObjectInfoEntry
): NodeMetadata {
  const properties: Property[] = [];
  const seen = new Set<string>();
  for (const section of ["required", "optional"] as const) {
    for (const [name, spec] of orderedInputs(entry, section)) {
      for (const prop of inputProperties(name, spec, section === "required")) {
        if (seen.has(prop.name)) continue;
        seen.add(prop.name);
        properties.push(prop);
      }
    }
  }
  const types = Array.isArray(entry.output) ? entry.output : [];
  const outputs: OutputSlot[] = comfyOutputNames(entry).map((name, index) => {
    const type = types[index];
    return {
      name,
      type: typeof type === "string" ? socketType(type) : { type: "any", optional: true, type_args: [] },
      stream: false
    };
  });
  const title = entry.display_name || entry.name || className;
  return {
    title,
    description: [entry.description ?? "", `ComfyUI node ${className}`, "comfy, comfyui"]
      .filter((s) => s.length > 0)
      .join("\n    "),
    namespace: namespaceFor(entry.category),
    node_type: `${COMFY_NODE_PREFIX}${className}`,
    layout: "default",
    properties,
    outputs,
    recommended_models: [],
    inline_fields: [],
    required_settings: ["COMFY_API_KEY"],
    supports_dynamic_inputs: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    effect: "external",
    deprecated: entry.deprecated === true,
    platforms: ["node"]
  };
}

/** NodeTool metadata for every class in a ComfyUI `/api/object_info` map. */
export function comfyObjectInfoToMetadata(info: ComfyObjectInfo): NodeMetadata[] {
  const out: NodeMetadata[] = [];
  for (const [className, entry] of Object.entries(info)) {
    if (!isRecord(entry)) continue;
    out.push(comfyEntryToMetadata(className, entry));
  }
  return out;
}

function nodeValues(node: ComfyGraphNode): Record<string, unknown> {
  const values = isRecord(node.properties) ? node.properties : isRecord(node.data) ? node.data : {};
  return values;
}

/**
 * Compile a graph of `comfy.*` nodes to ComfyUI's API format.
 *
 * `outputNames` returns the deduplicated output slot names of a ComfyUI class
 * (see {@link comfyOutputNames}); an edge from slot `n` links socket
 * `outputNames(class).indexOf(n)`. Literal values that are `null` are left
 * out, because a null in the API format is a broken link to ComfyUI.
 */
export function buildComfyPrompt(
  graph: ComfyGraph,
  outputNames: (classType: string) => string[] | undefined
): ComfyApiPrompt {
  const prompt: ComfyApiPrompt = {};
  const byId = new Map<string, ComfyGraphNode>();
  for (const node of graph.nodes) {
    if (!isComfyNodeType(node.type)) continue;
    byId.set(node.id, node);
    const inputs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(nodeValues(node))) {
      if (value === null || value === undefined) continue;
      if (key.startsWith("_")) continue;
      inputs[key] = value;
    }
    const title = isRecord(node.ui_properties) && typeof node.ui_properties.title === "string"
      ? node.ui_properties.title
      : undefined;
    prompt[node.id] = {
      class_type: comfyClassType(node.type),
      inputs,
      ...(title ? { _meta: { title } } : {})
    };
  }
  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = prompt[edge.target];
    if (!source || !target) continue;
    const names = outputNames(comfyClassType(source.type)) ?? [];
    let index = names.indexOf(edge.sourceHandle);
    if (index < 0) {
      const numeric = /(\d+)$/.exec(edge.sourceHandle);
      index = numeric && names.length === 0 ? Number(numeric[1]) : 0;
    }
    target.inputs[edge.targetHandle] = [edge.source, index];
  }
  return prompt;
}

function isLink(value: unknown): value is [string | number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === "string" || typeof value[0] === "number") &&
    typeof value[1] === "number"
  );
}

/**
 * Import an API-format prompt as a NodeTool graph of `comfy.*` nodes, laid out
 * left to right by dependency depth.
 */
export function comfyPromptToGraph(
  prompt: ComfyApiPrompt,
  outputNames: (classType: string) => string[] | undefined
): ComfyGraph {
  const ids = Object.keys(prompt);
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let d = 0;
    for (const value of Object.values(prompt[id]?.inputs ?? {})) {
      if (isLink(value) && String(value[0]) in prompt) {
        d = Math.max(d, depthOf(String(value[0])) + 1);
      }
    }
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  const rows = new Map<number, number>();
  const nodes: ComfyGraphNode[] = [];
  const edges: ComfyGraphEdge[] = [];
  for (const id of ids) {
    const entry = prompt[id];
    if (!entry || typeof entry.class_type !== "string") continue;
    const column = depthOf(id);
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    const data: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(entry.inputs ?? {})) {
      if (isLink(value)) {
        const sourceId = String(value[0]);
        const sourceClass = prompt[sourceId]?.class_type;
        const names = sourceClass ? outputNames(sourceClass) : undefined;
        edges.push({
          id: `${sourceId}-${value[1]}-${id}-${field}`,
          source: sourceId,
          sourceHandle: names?.[value[1]] ?? `output_${value[1]}`,
          target: id,
          targetHandle: field,
          ui_properties: null
        });
      } else {
        data[field] = value;
      }
    }
    const ui: Record<string, unknown> = {
      position: { x: column * 340, y: row * 260 },
      width: 280
    };
    if (entry._meta?.title) ui.title = entry._meta.title;
    nodes.push({
      id,
      type: `${COMFY_NODE_PREFIX}${entry.class_type}`,
      data,
      ui_properties: ui,
      dynamic_properties: {},
      dynamic_outputs: {}
    });
  }
  return { nodes, edges };
}

/**
 * Replace a Comfy graph with the single runner node the kernel executes. The
 * runner carries the original nodes and edges and compiles them at run time,
 * when it has the Comfy catalog to resolve output socket indexes.
 *
 * Returns the graph unchanged when it is not a Comfy graph.
 */
export function collapseComfyGraph<G extends { nodes: readonly object[]; edges: readonly object[] }>(
  graph: G
): G {
  const nodes = graph.nodes as ReadonlyArray<Record<string, unknown>>;
  const edges = graph.edges as ReadonlyArray<Record<string, unknown>>;
  if (!isComfyGraph({ nodes })) return graph;
  const comfyNodes = nodes.filter((n) => isComfyNodeType(n.type));
  const data = {
    nodes: comfyNodes.map((n) => ({
      id: String(n.id),
      type: String(n.type),
      properties: (isRecord(n.properties) ? n.properties : isRecord(n.data) ? n.data : {}) as Record<string, unknown>,
      ui_properties: isRecord(n.ui_properties) ? { title: n.ui_properties.title } : null
    })),
    edges: edges
      .filter((e) => e.edge_type !== "control")
      .map((e) => ({
        source: String(e.source),
        sourceHandle: String(e.sourceHandle ?? ""),
        target: String(e.target),
        targetHandle: String(e.targetHandle ?? "")
      }))
  };
  // The saved form reads `data`, the normalized form `properties`.
  const runner = {
    id: COMFY_CLOUD_GRAPH_NODE_ID,
    type: COMFY_CLOUD_GRAPH_NODE_TYPE,
    data,
    properties: data
  };
  return { ...graph, nodes: [runner], edges: [] } as G;
}
