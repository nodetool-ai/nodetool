import { ALL_BASE_NODES } from "@nodetool-ai/base-nodes";
import { getNodeMetadata, type NodeMetadata } from "@nodetool-ai/node-sdk";
import type { Edge } from "@nodetool-ai/protocol";

interface WorkflowLike {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

interface NormalizedNode {
  id: string;
  type: string;
  name?: string;
  properties: Record<string, unknown>;
  outputs: string[];
  dynamicOutputs: string[];
  streaming: boolean;
}

interface NormalizedEdge extends Edge {}

interface FactoryRef {
  namespaceImport: string;
  factoryName: string;
  metadata: NodeMetadata;
}

export interface WorkflowToDslOptions {
  workflowName?: string | null;
}

const JS_RESERVED = new Set([
  "break",
  "case",
  "catch",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "finally",
  "for",
  "function",
  "if",
  "in",
  "instanceof",
  "new",
  "return",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "class",
  "const",
  "enum",
  "export",
  "extends",
  "import",
  "super",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "yield",
  "await",
  "async"
]);

const BUILTIN_NAMES = new Set([
  "toString",
  "valueOf",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString"
]);

const TS_TYPE_KEYWORDS = new Set([
  "string",
  "number",
  "boolean",
  "any",
  "void",
  "never",
  "unknown",
  "object",
  "symbol",
  "bigint"
]);

let cachedFactoryRefs: Map<string, FactoryRef> | null = null;

function getFactoryRefs(): Map<string, FactoryRef> {
  if (cachedFactoryRefs == null) {
    cachedFactoryRefs = buildFactoryRefs();
  }
  return cachedFactoryRefs;
}

function buildFactoryRefs(): Map<string, FactoryRef> {
  const refs = new Map<string, FactoryRef>();
  const byNamespace = new Map<
    string,
    Array<{ metadata: NodeMetadata; factoryName: string }>
  >();
  const baseNodes = Array.isArray(ALL_BASE_NODES) ? ALL_BASE_NODES : [];

  for (const NodeClass of baseNodes) {
    const metadata = getNodeMetadata(NodeClass);
    const namespace = metadata.namespace;
    const factoryName = toCamelCase(extractClassName(metadata.node_type));
    const list = byNamespace.get(namespace) ?? [];
    list.push({ metadata, factoryName });
    byNamespace.set(namespace, list);
  }

  for (const [namespace, nodes] of byNamespace) {
    const counts = new Map<string, number>();
    const seen = new Map<string, number>();

    for (const node of nodes) {
      counts.set(node.factoryName, (counts.get(node.factoryName) ?? 0) + 1);
    }

    for (const node of nodes) {
      let factoryName = node.factoryName;
      if ((counts.get(factoryName) ?? 0) > 1) {
        const index = seen.get(factoryName) ?? 0;
        seen.set(factoryName, index + 1);
        if (index > 0) {
          factoryName = factoryName + "_".repeat(index);
        }
      }
      if (JS_RESERVED.has(factoryName) || BUILTIN_NAMES.has(factoryName)) {
        factoryName = `${factoryName}_`;
      }
      refs.set(node.metadata.node_type, {
        namespaceImport: barrelName(namespace),
        factoryName,
        metadata: node.metadata
      });
    }
  }

  return refs;
}

function extractClassName(nodeType: string): string {
  const parts = nodeType.split(".");
  return parts[parts.length - 1] ?? nodeType;
}

function toCamelCase(value: string): string {
  if (value.length === 0) {
    return value;
  }

  let i = 0;
  while (
    i < value.length &&
    value[i] === value[i].toUpperCase() &&
    value[i] !== value[i].toLowerCase()
  ) {
    i++;
  }

  if (i === 0) {
    return value;
  }
  if (i === value.length) {
    return value.toLowerCase();
  }
  if (i === 1) {
    return value[0]!.toLowerCase() + value.slice(1);
  }
  return value.slice(0, i - 1).toLowerCase() + value.slice(i - 1);
}

function barrelName(namespace: string): string {
  let normalized = namespace;
  if (normalized.startsWith("nodetool.")) {
    normalized = normalized.slice("nodetool.".length);
  }
  let name = normalized
    .split(".")
    .map((part, index) =>
      index === 0 ? part : part[0]!.toUpperCase() + part.slice(1)
    )
    .join("");
  if (TS_TYPE_KEYWORDS.has(name)) {
    name = `${name}_`;
  }
  return name;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function isValidIdentifier(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function formatKey(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name);
}

function formatLiteral(value: unknown, indentLevel = 0): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const indent = "  ".repeat(indentLevel);
    const childIndent = "  ".repeat(indentLevel + 1);
    const items = value.map(
      (item) => `${childIndent}${formatLiteral(item, indentLevel + 1)}`
    );
    return `[\n${items.join(",\n")}\n${indent}]`;
  }

  const record = asRecord(value);
  if (!record) {
    return JSON.stringify(value);
  }

  const entries = Object.entries(record);
  if (entries.length === 0) {
    return "{}";
  }

  const indent = "  ".repeat(indentLevel);
  const childIndent = "  ".repeat(indentLevel + 1);
  const lines = entries.map(
    ([key, entryValue]) =>
      `${childIndent}${formatKey(key)}: ${formatLiteral(entryValue, indentLevel + 1)}`
  );
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

function normalizeGraph(graph: WorkflowLike): {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
} {
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error("Workflow graph must contain node and edge arrays");
  }

  const nodes = graph.nodes.map((rawNode, index) => {
    const id = typeof rawNode.id === "string" ? rawNode.id : "";
    const type = typeof rawNode.type === "string" ? rawNode.type : "";
    if (!id) {
      throw new Error(`Workflow node at index ${index} is missing an id`);
    }
    if (!type) {
      throw new Error(`Workflow node '${id}' is missing a type`);
    }
    return {
      id,
      type,
      name: typeof rawNode.name === "string" ? rawNode.name : undefined,
      properties: asRecord(rawNode.properties) ?? asRecord(rawNode.data) ?? {},
      outputs: Object.keys(asRecord(rawNode.outputs) ?? {}),
      dynamicOutputs: Object.keys(asRecord(rawNode.dynamic_outputs) ?? {}),
      streaming:
        rawNode.streaming === true || rawNode.is_streaming_output === true
    } satisfies NormalizedNode;
  });

  const edges = graph.edges.map((rawEdge, index) => {
    if (rawEdge.edge_type === "control") {
      throw new Error(
        "Workflow contains control edges, which the TypeScript DSL does not support"
      );
    }

    const source = typeof rawEdge.source === "string" ? rawEdge.source : "";
    const sourceHandle =
      typeof rawEdge.sourceHandle === "string" ? rawEdge.sourceHandle : "";
    const target = typeof rawEdge.target === "string" ? rawEdge.target : "";
    const targetHandle =
      typeof rawEdge.targetHandle === "string" ? rawEdge.targetHandle : "";
    if (!source || !sourceHandle || !target || !targetHandle) {
      throw new Error(
        `Workflow edge at index ${index} is missing required fields`
      );
    }

    return {
      source,
      sourceHandle,
      target,
      targetHandle,
      edge_type: "data"
    } satisfies NormalizedEdge;
  });

  return { nodes, edges };
}

function makeIdentifier(
  raw: string,
  fallback: string,
  used: Set<string>
): string {
  const parts = raw
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part, index) => {
      const normalized = toCamelCase(part);
      if (index === 0) {
        return normalized;
      }
      return normalized[0]!.toUpperCase() + normalized.slice(1);
    });

  let identifier = parts.join("");
  if (!identifier) {
    identifier = fallback;
  }
  if (!/^[A-Za-z_$]/.test(identifier)) {
    identifier = `node${identifier}`;
  }
  if (JS_RESERVED.has(identifier) || BUILTIN_NAMES.has(identifier)) {
    identifier = `${identifier}Node`;
  }

  let uniqueIdentifier = identifier;
  if (used.has(uniqueIdentifier)) {
    uniqueIdentifier = `${identifier}Node`;
  }
  let suffix = 2;
  while (used.has(uniqueIdentifier)) {
    uniqueIdentifier = `${identifier}Node${suffix}`;
    suffix++;
  }
  used.add(uniqueIdentifier);
  return uniqueIdentifier;
}

function workflowConstName(workflowName?: string | null): string {
  const used = new Set<string>();
  const base =
    workflowName && workflowName.trim() ? workflowName : "exported workflow";
  let identifier = makeIdentifier(base, "exportedWorkflow", used);
  if (!identifier.toLowerCase().endsWith("workflow")) {
    identifier = `${identifier}Workflow`;
  }
  return identifier;
}

function topologicalSort(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[]
): NormalizedNode[] {
  const byId = new Map(nodes.map((node, index) => [node.id, { node, index }]));
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const edge of edges) {
    if (!byId.has(edge.source)) {
      throw new Error(
        `Workflow edge references missing source node '${edge.source}'`
      );
    }
    if (!byId.has(edge.target)) {
      throw new Error(
        `Workflow edge references missing target node '${edge.target}'`
      );
    }
    outgoing.get(edge.source)!.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (inDegree.get(node.id) ?? 0) === 0)
    .sort(
      (left, right) => byId.get(left.id)!.index - byId.get(right.id)!.index
    );
  const ordered: NormalizedNode[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);

    for (const targetId of outgoing.get(current.id) ?? []) {
      const next = (inDegree.get(targetId) ?? 0) - 1;
      inDegree.set(targetId, next);
      if (next === 0) {
        queue.push(byId.get(targetId)!.node);
        queue.sort(
          (left, right) => byId.get(left.id)!.index - byId.get(right.id)!.index
        );
      }
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error("Workflow contains a cycle and cannot be exported to DSL");
  }

  return ordered;
}

function formatInputs(
  node: NormalizedNode,
  incoming: NormalizedEdge[],
  variableNames: Map<string, string>,
  outputNameByNode: Map<
    string,
    { outputNames: string[]; defaultOutput?: string }
  >
): string {
  const keys = new Set<string>([
    ...Object.keys(node.properties),
    ...incoming.map((edge) => edge.targetHandle)
  ]);
  const entries: string[] = [];

  for (const key of keys) {
    const incomingEdge = incoming.find((edge) => edge.targetHandle === key);
    const expression = incomingEdge
      ? formatHandleExpression(
          incomingEdge.source,
          incomingEdge.sourceHandle,
          variableNames,
          outputNameByNode
        )
      : formatLiteral(node.properties[key], 1);
    entries.push(`  ${formatKey(key)}: ${expression}`);
  }

  if (entries.length === 0) {
    return "{}";
  }

  return `{\n${entries.join(",\n")}\n}`;
}

function formatHandleExpression(
  sourceNodeId: string,
  sourceHandle: string,
  variableNames: Map<string, string>,
  outputNameByNode: Map<
    string,
    { outputNames: string[]; defaultOutput?: string }
  >
): string {
  const variableName = variableNames.get(sourceNodeId);
  if (!variableName) {
    throw new Error(`Missing variable name for source node '${sourceNodeId}'`);
  }

  const outputInfo = outputNameByNode.get(sourceNodeId);
  if (outputInfo?.defaultOutput === sourceHandle) {
    return `${variableName}.output()`;
  }
  return `${variableName}.output(${JSON.stringify(sourceHandle)})`;
}

function buildCreateNodeOptions(
  node: NormalizedNode,
  outputNames: string[]
): string {
  const options: string[] = [];
  if (outputNames.length > 0) {
    options.push(
      `outputNames: [${outputNames.map((name) => JSON.stringify(name)).join(", ")}]`
    );
  }
  if (outputNames.length === 1) {
    options.push(`defaultOutput: ${JSON.stringify(outputNames[0])}`);
  }
  if (node.streaming) {
    options.push("streaming: true");
  }
  return options.length > 0 ? `, { ${options.join(", ")} }` : "";
}

/** @internal Exported for unit testing only. */
export const _testing = {
  toCamelCase,
  barrelName,
  extractClassName,
  isValidIdentifier,
  formatKey,
  formatLiteral,
  asRecord,
  normalizeGraph,
  makeIdentifier,
  topologicalSort,
  workflowConstName,
  formatHandleExpression,
  buildCreateNodeOptions
};

export function workflowToDsl(
  graph: WorkflowLike,
  options: WorkflowToDslOptions = {}
): string {
  const { nodes, edges } = normalizeGraph(graph);
  const orderedNodes = topologicalSort(nodes, edges);
  const outgoingBySource = new Map<string, NormalizedEdge[]>();
  const incomingByTarget = new Map<string, NormalizedEdge[]>();

  for (const edge of edges) {
    const outgoing = outgoingBySource.get(edge.source) ?? [];
    outgoing.push(edge);
    outgoingBySource.set(edge.source, outgoing);

    const incoming = incomingByTarget.get(edge.target) ?? [];
    incoming.push(edge);
    incomingByTarget.set(edge.target, incoming);
  }

  const namespaceImports = new Set<string>();
  const helperImports = new Set<string>(["workflow"]);
  const usedIdentifiers = new Set<string>([
    ...helperImports,
    "createNode",
    ...new Set([...getFactoryRefs().values()].map((ref) => ref.namespaceImport))
  ]);
  const variableNames = new Map<string, string>();
  const outputNameByNode = new Map<
    string,
    { outputNames: string[]; defaultOutput?: string }
  >();
  const nodeStatementByVar = new Map<string, string>();

  for (const node of orderedNodes) {
    const ref = getFactoryRefs().get(node.type);
    const outgoingHandles = [
      ...new Set(
        (outgoingBySource.get(node.id) ?? []).map((edge) => edge.sourceHandle)
      )
    ];
    const outputNames = [
      ...new Set([
        ...(ref?.metadata.outputs.map((output) => output.name) ?? []),
        ...node.outputs,
        ...node.dynamicOutputs,
        ...outgoingHandles
      ])
    ];
    const hasDynamicOutputs = node.dynamicOutputs.length > 0;
    const hasUnknownOutgoingHandle = ref
      ? outgoingHandles.some(
          (handle) =>
            !ref.metadata.outputs.some((output) => output.name === handle)
        )
      : false;
    const canUseFactory =
      !!ref && !hasDynamicOutputs && !hasUnknownOutgoingHandle;

    const preferredName = node.name ?? extractClassName(node.type);
    const fallbackName = `${toCamelCase(extractClassName(node.type)) || "node"}Node`;
    const variableName = makeIdentifier(
      preferredName,
      fallbackName,
      usedIdentifiers
    );
    variableNames.set(node.id, variableName);

    const inputs = formatInputs(
      node,
      incomingByTarget.get(node.id) ?? [],
      variableNames,
      outputNameByNode
    );
    const defaultOutput = outputNames.length === 1 ? outputNames[0] : undefined;
    outputNameByNode.set(node.id, { outputNames, defaultOutput });

    let statement: string;
    if (canUseFactory) {
      namespaceImports.add(ref.namespaceImport);
      statement = `const ${variableName} = ${ref.namespaceImport}.${ref.factoryName}(${inputs});`;
    } else {
      helperImports.add("createNode");
      const optionsCode = buildCreateNodeOptions(node, outputNames);
      statement = `const ${variableName} = createNode<Record<string, unknown>>(${JSON.stringify(node.type)}, ${inputs}${optionsCode});`;
    }
    nodeStatementByVar.set(variableName, statement);
  }

  const terminalNodes = orderedNodes.filter(
    (node) => (outgoingBySource.get(node.id)?.length ?? 0) === 0
  );
  if (terminalNodes.length === 0) {
    throw new Error("Workflow has no terminal nodes to export");
  }

  const imports = [...helperImports, ...namespaceImports].sort();
  const terminalRefs = terminalNodes.map((node) => variableNames.get(node.id)!);
  const lines: string[] = [];
  lines.push(`import { ${imports.join(", ")} } from "@nodetool-ai/dsl";`);
  lines.push("");

  for (const node of orderedNodes) {
    const variableName = variableNames.get(node.id)!;
    const statement = nodeStatementByVar.get(variableName);
    if (!statement)
      throw new Error(
        `Internal error: no statement for variable '${variableName}'`
      );
    lines.push(`// ${node.id} — ${node.type}`);
    lines.push(statement);
    lines.push("");
  }

  lines.push(
    `export const ${workflowConstName(options.workflowName)} = workflow(${terminalRefs.join(", ")});`
  );
  lines.push("");
  return lines.join("\n");
}
