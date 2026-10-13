/**
 * Workflow → JavaScript script.
 *
 * Turns a saved workflow graph into a script that calls each node as an async
 * function, in dependency order: `await` is the edge and a variable is the
 * wire. Two targets share one body and differ only in how a node is called:
 *
 *   sandbox — a body for a JS script document or a Code node. Each call
 *             goes through the `@nodetool-ai/sandbox-flow` pack's untyped
 *             bridge, which crosses to the host and runs on the invoking
 *             run's context.
 *   node    — a standalone `.mjs` for plain Node.js. Each call runs in process
 *             through `@nodetool-ai/dsl/flow`, with secrets read from the
 *             environment.
 *
 * Both reach the same native-flow backend (docs/dsl-native-flow-design.md), so
 * a node behaves the same in either. What a call cannot express is refused in
 * the generated script itself: a script with an unsupported node throws before
 * it runs anything, naming every node and the reason.
 */

import { ALL_BASE_NODES } from "@nodetool-ai/base-nodes";
import { rewriteBypassedNodes } from "@nodetool-ai/kernel";
import {
  getNodeMetadata,
  type NodeMetadata,
  type TypeMetadata
} from "@nodetool-ai/node-sdk";
import type { Edge, NodeDescriptor } from "@nodetool-ai/protocol";

export type ScriptTarget = "sandbox" | "node";

export interface WorkflowToScriptOptions {
  target: ScriptTarget;
  workflowName?: string | null;
  /**
   * Metadata for a node type. Defaults to the builtin node packages; a server
   * passes its registry so provider and pack nodes are described too.
   */
  getMetadata?: (nodeType: string) => NodeMetadata | undefined;
}

/** A declared script port, in the JS script document's `{name, type}` shape. */
export interface ScriptPort {
  name: string;
  type: string;
}

export interface ScriptIssue {
  node_id: string;
  node_type: string;
  message: string;
}

export interface WorkflowScript {
  code: string;
  /** Workflow inputs, read as `inputs.<name>`. */
  inputs: ScriptPort[];
  /** Workflow outputs, written with `output(name, …)` or `emit(name, …)`. */
  outputs: ScriptPort[];
  /** Nodes the script refuses to run. Non-empty means the script throws. */
  unsupported: ScriptIssue[];
}

interface WorkflowLike {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

const COMMENT_NODE_TYPE = "nodetool.workflows.base_node.Comment";
const GROUP_NODE_TYPE = "nodetool.workflows.base_node.Group";
const PREVIEW_NODE_TYPE = "nodetool.workflows.base_node.Preview";

const JS_RESERVED = new Set([
  "arguments", "async", "await", "break", "case", "catch", "class", "const",
  "continue", "debugger", "default", "delete", "do", "else", "enum", "eval",
  "export", "extends", "false", "finally", "for", "function", "if",
  "implements", "import", "in", "instanceof", "interface", "let", "new",
  "null", "package", "private", "protected", "public", "return", "static",
  "super", "switch", "this", "throw", "true", "try", "typeof", "undefined",
  "var", "void", "while", "with", "yield"
]);

/** Names the generated helpers and the sandbox globals already use. */
const RESERVED_NAMES = [
  "SKIPPED", "pick", "ready", "aggregate", "call", "callStreaming", "runNode",
  "streamNode", "isEmission", "inputs", "output", "emit", "results", "main",
  "flow", "stream", "state", "progress", "console", "media", "workspace",
  "fetch", "sleep", "crypto", "format", "image", "audio", "video", "canvas",
  "nodetool", "getSecret", "process", "invoke", "invokeStream", "startFlow",
  "invoke_node", "open_node_stream", "take_node_stream", "close_node_stream",
  "callNode", "bytesAsLength", "Symbol", "Object", "Array", "JSON", "Error", "Math",
  "Number", "String", "Promise"
];

// ── Graph normalization ─────────────────────────────────────────────────────

interface ScriptNode {
  id: string;
  type: string;
  name?: string;
  properties: Record<string, unknown>;
  /** Per-instance output correlation, for nodes whose ports are dynamic. */
  outputCorrelation?: Record<string, unknown>;
  isStreamingOutput?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface NormalizedGraph {
  nodes: ScriptNode[];
  edges: Edge[];
  controlEdges: Edge[];
}

function normalizeGraph(graph: WorkflowLike, getMetadata: NonNullable<WorkflowToScriptOptions["getMetadata"]>): NormalizedGraph {
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("Workflow graph must contain node and edge arrays");
  }

  const descriptors: NodeDescriptor[] = [];
  const extras = new Map<string, Pick<ScriptNode, "name" | "outputCorrelation" | "isStreamingOutput">>();
  graph.nodes.forEach((raw, index) => {
    const id = typeof raw.id === "string" ? raw.id : "";
    const type = typeof raw.type === "string" ? raw.type : "";
    if (!id) throw new Error(`Workflow node at index ${index} is missing an id`);
    if (!type) throw new Error(`Workflow node '${id}' is missing a type`);
    if (type === COMMENT_NODE_TYPE || type === GROUP_NODE_TYPE) return;
    const properties = {
      ...(asRecord(raw.properties) ?? asRecord(raw.data) ?? {}),
      ...(asRecord(raw.dynamic_properties) ?? {})
    };
    const metadata = getMetadata(type);
    descriptors.push({
      id,
      type,
      properties,
      outputs: { ...Object.fromEntries((metadata?.outputs ?? []).map((slot) => [slot.name, typeToString(slot.type)])), ...(asRecord(raw.outputs) ?? {}) },
      propertyTypes: { ...Object.fromEntries((metadata?.properties ?? []).map((slot) => [slot.name, typeToString(slot.type)])), ...(asRecord(raw.propertyTypes) ?? {}) },
      dynamic_outputs: asRecord(raw.dynamic_outputs) ?? undefined,
      dynamic_properties: asRecord(raw.dynamic_properties) ?? undefined,
      ui_properties: asRecord(raw.ui_properties) ?? undefined
    } as NodeDescriptor);
    extras.set(id, {
      name: typeof raw.name === "string" ? raw.name : undefined,
      outputCorrelation:
        asRecord(raw.output_correlation) ??
        asRecord(raw.dynamic_output_correlation) ??
        undefined,
      isStreamingOutput:
        typeof raw.is_streaming_output === "boolean"
          ? raw.is_streaming_output
          : undefined
    });
  });

  const nodeIds = new Set(descriptors.map((node) => node.id));
  const rawEdges: Edge[] = [];
  graph.edges.forEach((raw, index) => {
    const source = typeof raw.source === "string" ? raw.source : "";
    const target = typeof raw.target === "string" ? raw.target : "";
    const sourceHandle = typeof raw.sourceHandle === "string" ? raw.sourceHandle : "";
    const targetHandle = typeof raw.targetHandle === "string" ? raw.targetHandle : "";
    if (!source || !target || !sourceHandle || !targetHandle) {
      throw new Error(`Workflow edge at index ${index} is missing required fields`);
    }
    // The runner drops edges whose ends do not exist; so does the script.
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    rawEdges.push({
      id: typeof raw.id === "string" ? raw.id : undefined,
      source,
      sourceHandle,
      target,
      targetHandle,
      edge_type: raw.edge_type === "control" ? "control" : "data"
    } as Edge);
  });

  // Bypassed nodes are routed around exactly as the runner does it.
  const rewritten = rewriteBypassedNodes({ nodes: descriptors, edges: rawEdges });
  const nodes = rewritten.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    properties: (node.properties ?? {}) as Record<string, unknown>,
    ...extras.get(node.id)
  }));
  return {
    nodes,
    edges: rewritten.edges.filter((edge) => edge.edge_type !== "control"),
    controlEdges: rewritten.edges.filter((edge) => edge.edge_type === "control")
  };
}

function topologicalSort(nodes: ScriptNode[], edges: Edge[]): ScriptNode[] {
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const inDegree = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    outgoing.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, inDegree.get(edge.target)! + 1);
  }
  const byIndex = (a: ScriptNode, b: ScriptNode): number =>
    index.get(a.id)! - index.get(b.id)!;
  const queue = nodes.filter((node) => inDegree.get(node.id) === 0).sort(byIndex);
  const ordered: ScriptNode[] = [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const target of outgoing.get(current.id)!) {
      const left = inDegree.get(target)! - 1;
      inDegree.set(target, left);
      if (left === 0) {
        queue.push(byId.get(target)!);
        queue.sort(byIndex);
      }
    }
  }
  if (ordered.length !== nodes.length) {
    throw new Error(
      "Workflow contains a cycle (such as a Loop), which a script cannot express"
    );
  }
  return ordered;
}

// ── Metadata ────────────────────────────────────────────────────────────────

let builtinMetadata: Map<string, NodeMetadata> | null = null;

function builtinMetadataFor(nodeType: string): NodeMetadata | undefined {
  if (!builtinMetadata) {
    builtinMetadata = new Map();
    for (const NodeClass of ALL_BASE_NODES) {
      const metadata = getNodeMetadata(NodeClass);
      builtinMetadata.set(metadata.node_type, metadata);
    }
  }
  return builtinMetadata.get(nodeType);
}

function typeToString(type: TypeMetadata | undefined): string {
  if (!type?.type) return "any";
  const args = (type.type_args ?? []).map(typeToString);
  return args.length > 0 ? `${type.type}[${args.join(", ")}]` : type.type;
}

function correlationKind(value: unknown): string | undefined {
  const record = asRecord(value);
  return typeof record?.kind === "string" ? record.kind : undefined;
}

function correlationOf(
  node: ScriptNode,
  metadata: NodeMetadata | undefined,
  slot: string
): Record<string, unknown> | null {
  return (
    asRecord(node.outputCorrelation?.[slot]) ??
    asRecord(metadata?.output_correlation?.[slot])
  );
}

function consumesStreams(metadata: NodeMetadata | undefined): boolean {
  return metadata?.is_streaming_input === true || metadata?.input_mode === "stream";
}

// ── Code formatting ─────────────────────────────────────────────────────────

function isIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function formatKey(name: string): string {
  return isIdentifier(name) && !JS_RESERVED.has(name) ? name : JSON.stringify(name);
}

function formatLiteral(value: unknown, indent: string): string {
  if (value === undefined) return "undefined";
  const json = JSON.stringify(value, null, 2);
  if (json === undefined) return "undefined";
  return json.split("\n").join(`\n${indent}`);
}

function toCamelWords(raw: string): string {
  return raw
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part, index) => {
      const lower = /^[A-Z0-9_]+$/.test(part) ? part.toLowerCase() : part;
      return index === 0
        ? lower[0]!.toLowerCase() + lower.slice(1)
        : lower[0]!.toUpperCase() + lower.slice(1);
    })
    .join("");
}

function makeIdentifier(raw: string, fallback: string, used: Set<string>): string {
  let base = toCamelWords(raw) || fallback;
  if (!/^[A-Za-z_$]/.test(base)) base = `n${base}`;
  if (JS_RESERVED.has(base)) base = `${base}Node`;
  let name = base;
  for (let suffix = 2; used.has(name); suffix++) name = `${base}${suffix}`;
  used.add(name);
  return name;
}

function className(nodeType: string): string {
  return nodeType.split(".").pop() ?? nodeType;
}

function isInputNode(node: ScriptNode): boolean {
  return node.type.startsWith("nodetool.input.");
}

function isSinkNode(node: ScriptNode): boolean {
  return node.type.startsWith("nodetool.output.") || node.type === PREVIEW_NODE_TYPE;
}

function nameProperty(node: ScriptNode): string {
  const name = node.properties.name;
  return typeof name === "string" ? name.trim() : "";
}

// ── Generated runtime ───────────────────────────────────────────────────────

const SHARED_HELPERS = `const SKIPPED = Symbol("skipped");

// The value on one output slot, or SKIPPED when the node did not run or left
// the slot empty, such as the branch an If node did not take.
function pick(result, slot) {
  return result === SKIPPED || !(slot in result) ? SKIPPED : result[slot];
}

function aggregate(values, flatten) {
  const received = values.filter((value) => value !== SKIPPED);
  return received.length === 0 ? SKIPPED : flatten ? received.flat(1) : received;
}

// An untaken branch skips the node. Partial input keeps saved defaults.
function ready(props, defaults = {}) {
  const out = {};
  let received = false;
  let absent = false;
  for (const [key, value] of Object.entries(props)) {
    if (value === SKIPPED) { absent = true; continue; }
    received = true;
    out[key] = value;
  }
  return absent && !received ? null : { ...defaults, ...out };
}

// Run a node and return its outputs, the last value per slot.
async function call(type, props, defaults) {
  const args = ready(props, defaults);
  return args === null ? SKIPPED : await runNode(type, args);
}

function isEmission(item) {
  return typeof item.slot === "string" && "value" in item && Object.keys(item).length === 2;
}

// Run a node item by item: onItem sees each item, the result is the last value
// per slot.
async function callStreaming(type, props, onItem, defaults) {
  const args = ready(props, defaults);
  if (args === null) return SKIPPED;
  const last = {};
  for await (const item of streamNode(type, args)) {
    const record = isEmission(item) ? { [item.slot]: item.value } : item;
    Object.assign(last, record);
    await onItem(record);
  }
  return last;
}`;

const NODE_RUNTIME = `const inputs = JSON.parse(process.argv[2] ?? "{}");
const results = {};

async function output(name, value) {
  results[name] = value;
}

async function emit(name, value) {
  (results[name] ??= []).push(value);
}

function runNode(type, args) {
  return invoke(type, args);
}

function streamNode(type, args) {
  return invokeStream(type, args);
}

// Print raw media bytes as their length instead of one key per byte.
function bytesAsLength(key, value) {
  return value instanceof Uint8Array ? \`<\${value.length} bytes>\` : value;
}`;

// ── Body generation ─────────────────────────────────────────────────────────

interface StreamConsumer {
  slot: string;
  /** `emit` to this workflow output port. */
  emitPort?: string;
  /** Collect into this array variable for a stream-consuming node. */
  collectVar?: string;
}

export function workflowToScript(
  graph: WorkflowLike,
  options: WorkflowToScriptOptions
): WorkflowScript {
  const getMetadata = options.getMetadata ?? builtinMetadataFor;
  const { nodes, edges, controlEdges } = normalizeGraph(graph, getMetadata);
  const ordered = topologicalSort(nodes, edges);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const metadataOf = (node: ScriptNode): NodeMetadata | undefined =>
    getMetadata(node.type);

  const incoming = new Map<string, Edge[]>();
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) {
    (incoming.get(edge.target) ?? incoming.set(edge.target, []).get(edge.target)!).push(edge);
    (outgoing.get(edge.source) ?? outgoing.set(edge.source, []).get(edge.source)!).push(edge);
  }

  const unsupported: ScriptIssue[] = [];
  const refuse = (node: ScriptNode, message: string): void => {
    if (!unsupported.some((issue) => issue.node_id === node.id && issue.message === message)) {
      unsupported.push({ node_id: node.id, node_type: node.type, message });
    }
  };
  for (const node of nodes) {
    if (node.type === "nodetool.control.Zip") refuse(node, "requires iteration lineage that native script calls cannot represent");
  }
  for (const edge of controlEdges) {
    refuse(
      byId.get(edge.target)!,
      "is driven by a control edge from an agent, which a script cannot express"
    );
  }

  const used = new Set<string>([...JS_RESERVED, ...RESERVED_NAMES]);
  const variables = new Map<string, string>();
  for (const node of ordered) {
    const label = node.name ?? (nameProperty(node) || className(node.type));
    variables.set(node.id, makeIdentifier(label, "node", used));
  }

  // Ports. Input names become `inputs.<name>`, so they must be identifiers.
  const inputPorts: ScriptPort[] = [];
  const inputPortOf = new Map<string, string>();
  const usedInputs = new Set<string>();
  const outputPorts: ScriptPort[] = [];
  const outputPortOf = new Map<string, string>();
  const usedOutputs = new Set<string>();
  const sourceSlotType = (edge: Edge): string => {
    const metadata = metadataOf(byId.get(edge.source)!);
    return typeToString(metadata?.outputs.find((o) => o.name === edge.sourceHandle)?.type);
  };

  const isExternalInput = (node: ScriptNode): boolean =>
    isInputNode(node) && (incoming.get(node.id)?.length ?? 0) === 0;

  for (const node of ordered) {
    if (isExternalInput(node)) {
      const metadata = metadataOf(node);
      if (node.isStreamingOutput ?? metadata?.is_streaming_output) {
        refuse(node, "is a live input stream, which a script cannot receive");
      }
      const raw = nameProperty(node) || node.name || node.id;
      const port = makeIdentifier(raw, "input", usedInputs);
      inputPortOf.set(node.id, port);
      inputPorts.push({
        name: port,
        type: typeToString(metadata?.outputs.find((o) => o.name === "output")?.type)
      });
    } else if (isSinkNode(node)) {
      const raw =
        nameProperty(node) ||
        node.name ||
        (node.type === PREVIEW_NODE_TYPE ? "preview" : "output");
      const port = makeIdentifier(raw, "output", usedOutputs);
      outputPortOf.set(node.id, port);
      const valueEdge = (incoming.get(node.id) ?? []).find((e) => e.targetHandle === "value");
      outputPorts.push({ name: port, type: valueEdge ? sourceSlotType(valueEdge) : "any" });
    }
  }

  // Per-item edges. A stream may feed a workflow output (emitted item by
  // item) or a node that consumes streams (handed the collected items).
  // Anything else would run once per item in the graph and is refused.
  const streamConsumers = new Map<string, StreamConsumer[]>();
  const collectedInput = new Map<Edge, string>();
  const perItemSinkEdges = new Set<Edge>();
  // A slot delivers one value per item rather than one per run when it
  // iterates or streams chunks, or forwards an input that arrived per item.
  const perItemMemo = new Map<string, boolean>();
  const isPerItemSlot = (node: ScriptNode, slot: string): boolean => {
    const key = `${node.id}\u0000${slot}`;
    const known = perItemMemo.get(key);
    if (known !== undefined) return known;
    const metadata = metadataOf(node);
    const correlation = correlationOf(node, metadata, slot);
    const kind = correlationKind(correlation);
    let perItem: boolean;
    if (kind === "iteration" || kind === "chunk") {
      perItem = true;
    } else if (kind === "forward") {
      perItem = (incoming.get(node.id) ?? []).some(
        (edge) =>
          edge.targetHandle === correlation?.source &&
          isPerItemSlot(byId.get(edge.source)!, edge.sourceHandle)
      );
    } else if (kind) {
      perItem = false;
    } else {
      perItem =
        metadata?.outputs.find((output) => output.name === slot)?.stream ===
          true ||
        (node.isStreamingOutput ?? metadata?.is_streaming_output === true);
    }
    perItemMemo.set(key, perItem);
    return perItem;
  };

  for (const node of ordered) {
    for (const edge of outgoing.get(node.id) ?? []) {
      if (!isPerItemSlot(node, edge.sourceHandle)) continue;
      const target = byId.get(edge.target)!;
      const consumers = streamConsumers.get(node.id) ?? [];
      if (isSinkNode(target) && edge.targetHandle === "value") {
        consumers.push({ slot: edge.sourceHandle, emitPort: outputPortOf.get(target.id) });
        perItemSinkEdges.add(edge);
      } else if (consumesStreams(metadataOf(target))) {
        const collectVar = makeIdentifier(
          `${variables.get(node.id)} ${edge.sourceHandle} items`,
          "items",
          used
        );
        consumers.push({ slot: edge.sourceHandle, collectVar });
        collectedInput.set(edge, collectVar);
      } else {
        refuse(
          target,
          `receives "${edge.sourceHandle}" from ${className(node.type)} one item at a time; ` +
            "in the graph it runs once per item, which one script call cannot reproduce"
        );
      }
      streamConsumers.set(node.id, consumers);
    }
  }

  for (const node of [...ordered].reverse()) {
    if (!isSinkNode(node)) continue;
    const valueEdges = (incoming.get(node.id) ?? []).filter((edge) => edge.targetHandle === "value");
    const consumers = streamConsumers.get(node.id) ?? [];
    if (consumers.length === 0 || !valueEdges.every((edge) => perItemSinkEdges.has(edge))) continue;
    for (const edge of valueEdges) {
      const upstream = streamConsumers.get(edge.source) ?? [];
      upstream.push(...consumers.map((consumer) => ({ ...consumer, slot: edge.sourceHandle })));
      streamConsumers.set(edge.source, upstream);
    }
    streamConsumers.delete(node.id);
  }

  // Several edges into one list input arrive as one list. Into any other
  // input each value is its own run of the node, which one call is not.
  for (const node of ordered) {
    const counts = new Map<string, number>();
    for (const edge of incoming.get(node.id) ?? []) {
      counts.set(edge.targetHandle, (counts.get(edge.targetHandle) ?? 0) + 1);
    }
    for (const [handle, count] of counts) {
      if (count < 2) continue;
      const type = metadataOf(node)?.properties.find((p) => p.name === handle)?.type;
      if (type && type.type !== "list" && type.type !== "any") {
        refuse(
          node,
          `receives ${count} values on "${handle}", and in the graph it runs once for each`
        );
      }
    }
  }

  const expressionFor = (edge: Edge): string => {
    const collected = collectedInput.get(edge);
    if (collected) return collected;
    const source = byId.get(edge.source)!;
    const variable = variables.get(source.id)!;
    return `pick(${variable}, ${JSON.stringify(edge.sourceHandle)})`;
  };

  const propsLiteral = (node: ScriptNode, indent: string): string => {
    const props: Array<[string, string]> = [];
    const edgesIn = (incoming.get(node.id) ?? []).filter((e) => !perItemSinkEdges.has(e));
    const byHandle = new Map<string, Edge[]>();
    for (const edge of edgesIn) {
      (byHandle.get(edge.targetHandle) ?? byHandle.set(edge.targetHandle, []).get(edge.targetHandle)!).push(edge);
    }
    const inner = `${indent}  `;
    for (const [handle, handleEdges] of byHandle) {
      const expressions = handleEdges.map(expressionFor);
      const type = metadataOf(node)?.properties.find((property) => property.name === handle)?.type;
      const combined = `aggregate([${expressions.join(", ")}], ${type?.type === "list" && type.type_args?.[0]?.type !== "list"})`;
      props.push([
        handle,
        expressions.length === 1 ? expressions[0]! : combined
      ]);
    }
    if (props.length === 0) return "{}";
    return `{\n${props.map(([k, v]) => `${inner}${formatKey(k)}: ${v}`).join(",\n")}\n${indent}}`;
  };

  const body: string[] = [];
  const buffers = new Set([...streamConsumers.values()].flatMap((consumers) => consumers.flatMap((consumer) => consumer.collectVar ? [consumer.collectVar] : [])));
  for (const buffer of buffers) body.push(`const ${buffer} = [];`);
  if (buffers.size > 0) body.push("");
  for (const node of ordered) {
    const variable = variables.get(node.id)!;
    const title = node.name ?? nameProperty(node);
    body.push(commentLine(`${title ? `${title} — ` : ""}${node.type} (${node.id})`));

    if (unsupported.some((issue) => issue.node_id === node.id)) {
      body.push(`const ${variable} = SKIPPED; // not supported, see the check above`);
      body.push("");
      continue;
    }

    if (isExternalInput(node)) {
      const port = inputPortOf.get(node.id)!;
      body.push(`const ${variable} = await call(${JSON.stringify(node.type)}, { ...${formatLiteral(node.properties, "")}, value: inputs.${port} ?? ${formatLiteral(node.properties.value, "")} });`);
      body.push("");
      continue;
    }

    if (isSinkNode(node)) {
      const port = outputPortOf.get(node.id)!;
      const valueEdges = (incoming.get(node.id) ?? []).filter((e) => e.targetHandle === "value");
      if (valueEdges.length > 0 && valueEdges.every((e) => perItemSinkEdges.has(e))) {
        body.push(`// "${port}" is emitted item by item where its source runs.`);
        body.push("");
        continue;
      }
      body.push(`const ${variable} = await call(${JSON.stringify(node.type)}, ${propsLiteral(node, "")}, ${formatLiteral(node.properties, "")});`);
      body.push(`if (${variable} !== SKIPPED) await output(${JSON.stringify(port)}, ${variable}.output);`);
      body.push("");
      continue;
    }

    const consumers = streamConsumers.get(node.id) ?? [];
    if (consumers.length === 0) {
      body.push(`const ${variable} = await call(${JSON.stringify(node.type)}, ${propsLiteral(node, "")}, ${formatLiteral(node.properties, "")});`);
      body.push("");
      continue;
    }

    body.push(`const ${variable} = await callStreaming(${JSON.stringify(node.type)}, ${propsLiteral(node, "")}, async (item) => {`);
    const bySlot = new Map<string, StreamConsumer[]>();
    for (const consumer of consumers) {
      (bySlot.get(consumer.slot) ?? bySlot.set(consumer.slot, []).get(consumer.slot)!).push(consumer);
    }
    for (const [slot, slotConsumers] of bySlot) {
      const key = JSON.stringify(slot);
      body.push(`  if (${key} in item) {`);
      for (const consumer of slotConsumers) {
        if (consumer.emitPort) {
          body.push(`    await emit(${JSON.stringify(consumer.emitPort)}, item[${key}]);`);
        } else if (consumer.collectVar) {
          body.push(`    ${consumer.collectVar}.push(item[${key}]);`);
        }
      }
      body.push("  }");
    }
    body.push(`}, ${formatLiteral(node.properties, "")});`);
    body.push("");
  }

  const guard: string[] = [];
  if (unsupported.length > 0) {
    const lines = unsupported.map(
      (issue) => `- ${issue.node_type} (${issue.node_id}) ${issue.message}`
    );
    guard.push(
      "// This workflow has nodes a script cannot run. It stops here, before any",
      "// node runs, so nothing is billed for a run that cannot finish.",
      `throwUnsupported(${JSON.stringify(lines, null, 2)});`,
      "",
      "function throwUnsupported(problems) {",
      '  throw new Error("This workflow cannot run as a script:\\n" + problems.join("\\n"));',
      "}",
      ""
    );
  }

  const name =
    options.workflowName && options.workflowName.trim()
      ? options.workflowName.trim()
      : "Untitled workflow";
  const code =
    options.target === "sandbox"
      ? sandboxScript(name, inputPorts, outputPorts, guard, body)
      : nodeScript(name, inputPorts, outputPorts, guard, body);

  return { code, inputs: inputPorts, outputs: outputPorts, unsupported };
}

function portList(ports: ScriptPort[]): string {
  return ports.length > 0
    ? ports.map((port) => `${port.name} (${port.type})`).join(", ")
    : "none";
}

function commentLine(text: string): string {
  return `// ${text.replace(/\s+/g, " ")}`;
}

function sandboxScript(
  name: string,
  inputs: ScriptPort[],
  outputs: ScriptPort[],
  guard: string[],
  body: string[]
): string {
  return [
    commentLine(`"${name}", exported from NodeTool as a sandbox script.`),
    "// Run it as a JS script document or paste it into a Code node. Each node",
    "// runs on the host and is billed to the run that calls it.",
    commentLine(`Inputs: ${portList(inputs)}`),
    commentLine(`Outputs: ${portList(outputs)}`),
    'import "@nodetool-ai/sandbox-nodetool/flow";',
    'import { callNode as runNode, streamNode } from "@nodetool-ai/sandbox-flow";',
    "",
    ...guard,
    SHARED_HELPERS,
    "",
    ...body
  ].join("\n").trimEnd() + "\n";
}

function nodeScript(
  name: string,
  inputs: ScriptPort[],
  outputs: ScriptPort[],
  guard: string[],
  body: string[]
): string {
  const example = Object.fromEntries(inputs.map((port) => [port.name, "…"]));
  const indented = body
    .flatMap((entry) => entry.split("\n"))
    .map((line) => (line ? `  ${line}` : line));
  while (indented.length > 0 && indented[indented.length - 1] === "") indented.pop();
  return [
    "#!/usr/bin/env node",
    commentLine(`"${name}", exported from NodeTool as a Node.js script.`),
    "//",
    "// Needs Node.js 22 or newer and the NodeTool node runtime:",
    "//   npm install @nodetool-ai/dsl",
    "// Run it with the workflow inputs as a JSON object:",
    `//   node script.mjs '${JSON.stringify(example)}'`,
    "// Provider keys are read from environment variables such as OPENAI_API_KEY.",
    "// The outputs are printed as JSON when the run finishes.",
    commentLine(`Inputs: ${portList(inputs)}`),
    commentLine(`Outputs: ${portList(outputs)}`),
    'import { startFlow, invoke, invokeStream } from "@nodetool-ai/dsl/flow";',
    "",
    ...guard,
    NODE_RUNTIME,
    "",
    SHARED_HELPERS,
    "",
    "async function main() {",
    ...indented,
    "}",
    "",
    "const flow = await startFlow();",
    "try {",
    "  await flow.run(main);",
    "} finally {",
    "  await flow.close();",
    "}",
    "console.log(JSON.stringify(results, bytesAsLength, 2));",
    ""
  ].join("\n");
}
