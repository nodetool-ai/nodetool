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
import { isNumber, isString } from "./predicates.js";

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
  return isString(type) && type.startsWith(COMFY_NODE_PREFIX);
}

/** The ComfyUI class name behind a `comfy.<ClassName>` node type. */
export function comfyClassType(nodeType: string): string {
  return nodeType.slice(COMFY_NODE_PREFIX.length);
}

/**
 * True for a standard workflow Input or Output node. These nodes give a Comfy
 * workflow the same inputs and outputs as any other workflow.
 */
export function isComfyBoundaryNodeType(type: unknown): type is string {
  return (
    isString(type) &&
    (type.startsWith("nodetool.input.") || type.startsWith("nodetool.output."))
  );
}

/**
 * True when the graph has a ComfyUI node class and every other runnable node
 * is a workflow Input or Output. Editor annotations (comments, groups,
 * previews) do not count either way.
 */
export function isComfyGraph(graph: { nodes: ReadonlyArray<{ type?: unknown }> }): boolean {
  let comfy = 0;
  for (const node of graph.nodes) {
    if (isString(node.type) && EDITOR_ONLY_TYPES.has(node.type)) continue;
    if (isComfyBoundaryNodeType(node.type)) continue;
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
  return isNumber(value) && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER
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
      isString(def) || isNumber(def) ? def : fallback,
    title: name,
    description: isString(opts.tooltip) ? opts.tooltip : null,
    values,
    required
  };
}

/**
 * Properties for one ComfyUI input. A dynamic combo (`COMFY_DYNAMICCOMBO_V3`)
 * is an enum of its option keys plus the inputs of its default option,
 * flattened, which is how the API format carries them (`format`, `format.codec`).
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
  const description = isString(opts.tooltip) ? opts.tooltip : null;

  if (Array.isArray(kind)) {
    const values = kind.filter(
      (v): v is string | number => isString(v) || isNumber(v)
    );
    return [enumProperty(name, values, opts, required)];
  }
  if (!isString(kind)) return [];

  if (kind === "COMBO" && Array.isArray(opts.options)) {
    const values = opts.options.filter(
      (v): v is string | number => isString(v) || isNumber(v)
    );
    return [enumProperty(name, values, opts, required)];
  }

  if (kind === "COMFY_DYNAMICCOMBO_V3" && Array.isArray(opts.options)) {
    const options = opts.options.filter(isRecord);
    const keys = options
      .map((o) => o.key)
      .filter((k): k is string => isString(k));
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
            ...inputProperties(`${name}.${child}`, childSpec, section === "required" && required, depth + 1)
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
    if (isNumber(opts.step)) extra.step = opts.step;
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
    const base = String(names[index] ?? (isString(type) ? type : `output_${index}`));
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}

function namespaceFor(category: string | undefined): string {
  const parts = (category ?? "")
    .split("/")
    .map((p) => trimUnderscores(p.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_")))
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
/**
 * `requiredSettings` names the settings a run on the selected target needs:
 * `COMFY_API_KEY` for Comfy Cloud, none for the user's own server or worker.
 */
export interface ComfyMetadataOptions {
  requiredSettings?: string[];
}

export function comfyEntryToMetadata(
  className: string,
  entry: ComfyObjectInfoEntry,
  options: ComfyMetadataOptions = {}
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
      type: isString(type) ? socketType(type) : { type: "any", optional: true, type_args: [] },
      stream: false
    };
  });
  // A save/preview node gets a media slot of the kind it saves, appended after
  // its sockets, so the editor has somewhere to show the file the job returns.
  // It is display only: prompts link sockets by `comfyOutputNames`.
  let primaryOutput: string | undefined;
  if (entry.output_node === true) {
    const sockets = new Set(properties.map((p) => p.type.type));
    const kind = sockets.has(`${COMFY_SOCKET_PREFIX}VIDEO`)
      ? "video"
      : sockets.has(`${COMFY_SOCKET_PREFIX}AUDIO`)
        ? "audio"
        : sockets.has(`${COMFY_SOCKET_PREFIX}IMAGE`)
          ? "image"
          : null;
    if (kind) {
      outputs.push({ name: "output", type: { type: kind, optional: true, type_args: [] }, stream: false });
      primaryOutput = "output";
    }
  }
  const title = entry.display_name || entry.name || className;
  const metadata: NodeMetadata = {
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
    // Sockets are wired, widgets are edited on the node, as in ComfyUI.
    input_fields: properties
      .filter((p) => p.type.type === "any" || p.type.type.startsWith(COMFY_SOCKET_PREFIX))
      .map((p) => p.name),
    inline_fields: properties
      .filter((p) => !(p.type.type === "any" || p.type.type.startsWith(COMFY_SOCKET_PREFIX)))
      .map((p) => p.name),
    required_settings: options.requiredSettings ?? ["COMFY_API_KEY"],
    supports_dynamic_inputs: false,
    supports_dynamic_outputs: false,
    is_streaming_output: false,
    effect: "external",
    deprecated: entry.deprecated === true,
    platforms: ["node"]
  };
  if (primaryOutput) {
    metadata.primary_output = primaryOutput;
    // The runner saves this node's files under its id, so its history reloads.
    metadata.auto_save_asset = true;
  }
  return metadata;
}

/** NodeTool metadata for every class in a ComfyUI `/api/object_info` map. */
export function comfyObjectInfoToMetadata(
  info: ComfyObjectInfo,
  options: ComfyMetadataOptions = {}
): NodeMetadata[] {
  const out: NodeMetadata[] = [];
  for (const [className, entry] of Object.entries(info)) {
    if (!isRecord(entry)) continue;
    out.push(comfyEntryToMetadata(className, entry, options));
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
    const title = isRecord(node.ui_properties) && isString(node.ui_properties.title)
      ? node.ui_properties.title
      : undefined;
    const entry: ComfyApiPrompt[string] = { class_type: comfyClassType(node.type), inputs };
    if (title) entry._meta = { title };
    prompt[node.id] = entry;
  }
  for (const edge of graph.edges) {
    const source = byId.get(edge.source);
    const target = prompt[edge.target];
    if (!source || !target) continue;
    const names = outputNames(comfyClassType(source.type)) ?? [];
    let index = names.indexOf(edge.sourceHandle);
    if (index < 0) {
      // Without the catalog an imported edge keeps its `output_<n>` handle.
      const prefix = "output_";
      const tail = edge.sourceHandle.startsWith(prefix) ? Number(edge.sourceHandle.slice(prefix.length)) : NaN;
      index = names.length === 0 && Number.isInteger(tail) && tail >= 0 ? tail : 0;
    }
    target.inputs[edge.targetHandle] = [edge.source, index];
  }
  return prompt;
}

function isLink(value: unknown): value is [string | number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (isString(value[0]) || isNumber(value[0])) &&
    isNumber(value[1])
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
    if (!entry || !isString(entry.class_type)) continue;
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
      position: { x: column * 340, y: row * 330 },
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

const SAVE_CLASS = /^(Save|VHS_VideoCombine)/;
const INPUT_NODE_TYPES = {
  image: "nodetool.input.ImageInput",
  audio: "nodetool.input.AudioInput",
  video: "nodetool.input.VideoInput"
} as const;
/** The Load classes a run can feed, with the field that names the file. */
const LOAD_CLASSES: Readonly<Record<string, { kind: keyof typeof INPUT_NODE_TYPES; field: string }>> = {
  LoadImage: { kind: "image", field: "image" },
  LoadAudio: { kind: "audio", field: "audio" },
  LoadVideo: { kind: "video", field: "file" }
};
const PROMPT_FIELDS = ["text", "prompt", "tags", "caption"];

function saveKind(classType: string): "image" | "audio" | "video" | null {
  if (!SAVE_CLASS.test(classType)) return null;
  if (/Video/.test(classType)) return "video";
  if (/Audio/.test(classType)) return "audio";
  return /Image|WEBP|PNG/.test(classType) ? "image" : null;
}

/**
 * The node and field that hold the positive prompt: walk upstream from the
 * `positive` socket to the first node with a literal prompt field. A graph with
 * no `positive` socket uses its only text encoder.
 */
function positivePrompt(graph: ComfyGraph): { node: ComfyGraphNode; field: string } | null {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const promptField = (node: ComfyGraphNode): string | undefined =>
    /^comfy\.PrimitiveString/.test(node.type) && isString(nodeValues(node).value)
      ? "value"
      : PROMPT_FIELDS.find((field) => isString(nodeValues(node)[field]));
  const pending = graph.edges.filter((e) => e.targetHandle === "positive").map((e) => e.source);
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node) continue;
    const field = promptField(node);
    if (field) return { node, field };
    pending.push(...graph.edges.filter((e) => e.target === id).map((e) => e.source));
  }
  const encoders = graph.nodes.filter((node) => isComfyNodeType(node.type) && /TextEncode/.test(node.type) && promptField(node));
  const [only] = encoders;
  return encoders.length === 1 && only ? { node: only, field: promptField(only) as string } : null;
}

function nodePosition(node: ComfyGraphNode): { x: number; y: number } {
  const position = isRecord(node.ui_properties) ? node.ui_properties.position : null;
  return isRecord(position) && isNumber(position.x) && isNumber(position.y)
    ? { x: position.x, y: position.y }
    : { x: 0, y: 0 };
}

/**
 * The graph as contract readers and the kernel see it. A stored Comfy graph
 * holds only ComfyUI nodes, so this derives its contract: one input per Load
 * node and for the positive prompt, one output per Save node. The result is
 * never saved. A graph with its own Input or Output nodes keeps them, and any
 * other graph is returned unchanged.
 *
 * Node ids are derived from the Comfy node and field, so a binding to a derived
 * input stays valid across runs.
 */
export function exposeComfyInterface<G extends { nodes: readonly object[]; edges: readonly object[] }>(
  source: G
): G {
  const nodesIn = source.nodes as ReadonlyArray<{ type?: unknown }>;
  if (!isComfyGraph({ nodes: nodesIn })) return source;
  if (nodesIn.some((node) => isComfyBoundaryNodeType(node.type))) return source;
  const graph = source as unknown as ComfyGraph;
  const added: ComfyGraphNode[] = [];
  const addedEdges: ComfyGraphEdge[] = [];
  const counts = new Map<string, number>();
  const uniqueName = (base: string): string => {
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  };
  const addInput = (target: ComfyGraphNode, field: string, type: string, name: string, value: unknown): void => {
    const id = `input_${target.id}_${field}`;
    const { x, y } = nodePosition(target);
    added.push({
      id,
      type,
      data: { name, description: "", value },
      // Editor readers use `data`, and the kernel uses `properties`.
      properties: { name, description: "", value },
      ui_properties: { position: { x: x - 340, y }, width: 280 },
      dynamic_properties: {},
      dynamic_outputs: {}
    });
    addedEdges.push({
      id: `${id}-${target.id}`,
      source: id,
      sourceHandle: "output",
      target: target.id,
      targetHandle: field,
      ui_properties: null
    });
  };

  const prompt = positivePrompt(graph);
  if (prompt) {
    addInput(prompt.node, prompt.field, "nodetool.input.StringInput", uniqueName("prompt"), nodeValues(prompt.node)[prompt.field]);
  }
  const nodes = graph.nodes.map((node) => {
    if (!isComfyNodeType(node.type)) return node;
    const classType = comfyClassType(node.type);
    const load = LOAD_CLASSES[classType];
    if (load) {
      addInput(node, load.field, INPUT_NODE_TYPES[load.kind], uniqueName(load.kind), { type: load.kind, uri: "" });
      return node;
    }
    const kind = saveKind(classType);
    if (!kind) return node;
    const id = `output_${node.id}`;
    const outputName = uniqueName("output");
    const { x, y } = nodePosition(node);
    added.push({
      id,
      type: "nodetool.output.Output",
      data: { name: outputName, description: "" },
      properties: { name: outputName, description: "" },
      ui_properties: { position: { x: x + 340, y }, width: 280 },
      dynamic_properties: {},
      dynamic_outputs: {}
    });
    addedEdges.push({
      id: `${node.id}-${id}`,
      source: node.id,
      sourceHandle: "output",
      target: id,
      targetHandle: "value",
      ui_properties: null
    });
    const dynamicOutputs: Record<string, unknown> = { ...(node.dynamic_outputs as Record<string, unknown> | undefined) };
    dynamicOutputs.output = { type: kind, optional: true, type_args: [] };
    return { ...node, dynamic_outputs: dynamicOutputs };
  });
  return { ...source, nodes: [...nodes, ...added], edges: [...graph.edges, ...addedEdges] } as unknown as G;
}

/**
 * Replace a Comfy graph with the single runner node the kernel executes. The
 * runner carries the original nodes and edges and compiles them at run time,
 * when it has the Comfy catalog to resolve output socket indexes. Input and
 * Output nodes stay in the graph. An edge from an Input becomes a runner input
 * `<comfyNodeId>:<field>`, and an edge to an Output reads the runner output
 * `<comfyNodeId>:<handle>`.
 *
 * Returns the graph unchanged when it is not a Comfy graph.
 */
export function collapseComfyGraph<G extends { nodes: readonly object[]; edges: readonly object[] }>(
  source: G
): G {
  if (!isComfyGraph({ nodes: source.nodes as ReadonlyArray<{ type?: unknown }> })) return source;
  const graph = exposeComfyInterface(source);
  const nodes = graph.nodes as ReadonlyArray<Record<string, unknown>>;
  const edges = graph.edges as ReadonlyArray<Record<string, unknown>>;
  const comfyNodes = nodes.filter((n) => isComfyNodeType(n.type));
  const boundaryNodes = nodes.filter((n) => isComfyBoundaryNodeType(n.type));
  const comfyIds = new Set(comfyNodes.map((n) => String(n.id)));
  const keptIds = new Set(boundaryNodes.map((n) => String(n.id)));
  const data = {
    nodes: comfyNodes.map((n) => ({
      id: String(n.id),
      type: String(n.type),
      properties: (isRecord(n.properties) ? n.properties : isRecord(n.data) ? n.data : {}) as Record<string, unknown>,
      ui_properties: isRecord(n.ui_properties) ? { title: n.ui_properties.title } : null
    })),
    edges: edges
      .filter(
        (e) =>
          e.edge_type !== "control" &&
          comfyIds.has(String(e.source)) &&
          comfyIds.has(String(e.target))
      )
      .map((e) => ({
        source: String(e.source),
        sourceHandle: String(e.sourceHandle ?? ""),
        target: String(e.target),
        targetHandle: String(e.targetHandle ?? "")
      })),
    output_slots: [] as string[]
  };
  const dynamicOutputs: Record<string, unknown> = {};
  const boundaryEdges: Array<Record<string, unknown>> = [];
  for (const edge of edges) {
    const fromComfy = comfyIds.has(String(edge.source));
    const toComfy = comfyIds.has(String(edge.target));
    if (fromComfy && toComfy) continue;
    if (fromComfy && keptIds.has(String(edge.target))) {
      const slot = `${String(edge.source)}:${String(edge.sourceHandle ?? "")}`;
      data.output_slots.push(slot);
      dynamicOutputs[slot] = { type: "any", optional: true, type_args: [] };
      boundaryEdges.push({ ...edge, source: COMFY_CLOUD_GRAPH_NODE_ID, sourceHandle: slot });
    } else if (toComfy && keptIds.has(String(edge.source))) {
      boundaryEdges.push({
        ...edge,
        target: COMFY_CLOUD_GRAPH_NODE_ID,
        targetHandle: `${String(edge.target)}:${String(edge.targetHandle ?? "")}`
      });
    } else if (keptIds.has(String(edge.source)) && keptIds.has(String(edge.target))) {
      boundaryEdges.push(edge);
    }
  }
  // The saved form reads `data`, the normalized form `properties`.
  const runner = {
    id: COMFY_CLOUD_GRAPH_NODE_ID,
    type: COMFY_CLOUD_GRAPH_NODE_TYPE,
    data,
    properties: data,
    dynamic_outputs: dynamicOutputs
  };
  return { ...graph, nodes: [runner, ...boundaryNodes], edges: boundaryEdges } as G;
}
