/**
 * Code generation script for @nodetool-ai/dsl
 *
 * Introspects all registered nodes from @nodetool-ai/base-nodes and emits two
 * trees from one metadata pass:
 *
 *  - `src/generated/` — the graph DSL: a factory per node returning a
 *    `DslNode`, wired with `Connectable<T>` handles.
 *  - `src/flow/generated/` — the native flow surface, which runs inside the
 *    QuickJS guest: a callable per node taking plain values and returning its
 *    outputs, delegating to `../guest-core.js`.
 *
 * Run: npx tsx packages/dsl/scripts/codegen.ts [--check] [--graph|--flow]
 *
 * `--check` writes nothing and exits 1 on any difference. `--graph` / `--flow`
 * narrow the run to one tree.
 */

import fs from "node:fs";
import path from "node:path";
import { ALL_BASE_NODES } from "@nodetool-ai/base-nodes";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import type {
  NodeMetadata,
  PropertyMetadata,
  TypeMetadata,
  OutputSlotMetadata
} from "@nodetool-ai/node-sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../src"
);

const GENERATED_DIR = path.join(SRC_DIR, "generated");
const FLOW_GENERATED_DIR = path.join(SRC_DIR, "flow", "generated");

const HEADER = "// Auto-generated — do not edit manually\n";

const FLOW_HEADER = `${HEADER}// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.
`;

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

/** Built-in names that shadow Object.prototype or TS keywords when used as identifiers. */
const BUILTIN_NAMES = new Set([
  "toString",
  "valueOf",
  "constructor",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString"
]);

/** TypeScript type keywords that shouldn't be used as barrel export names. */
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

// ---------------------------------------------------------------------------
// Type mapping
// ---------------------------------------------------------------------------

const MEDIA_TYPES: Record<string, string> = {
  image: "ImageRef",
  imageref: "ImageRef",
  audio: "AudioRef",
  audioref: "AudioRef",
  video: "VideoRef",
  videoref: "VideoRef",
  text: "TextRef",
  textref: "TextRef",
  dataframe: "DataframeRef",
  dataframeref: "DataframeRef",
  folder: "FolderRef",
  folderref: "FolderRef"
};

const ALL_MEDIA_IMPORTS = [
  "ImageRef",
  "AudioRef",
  "VideoRef",
  "TextRef",
  "DataframeRef",
  "FolderRef"
];

function mapType(tm: TypeMetadata): string {
  const t = tm.type.toLowerCase();

  // Enum with values
  if (t === "enum" && tm.values && tm.values.length > 0) {
    return tm.values.map((v) => JSON.stringify(v)).join(" | ");
  }

  // Optional
  if (t === "optional" || tm.optional) {
    if (tm.type_args && tm.type_args.length > 0) {
      return `${mapType(tm.type_args[0])} | undefined`;
    }
    return "unknown | undefined";
  }

  // Union (deduplicate mapped types, e.g. int|float both map to number)
  if (t === "union" && tm.type_args && tm.type_args.length > 0) {
    const mapped = [...new Set(tm.type_args.map(mapType))];
    return mapped.join(" | ");
  }

  // List
  if (t === "list" || t === "array") {
    if (tm.type_args && tm.type_args.length > 0) {
      const inner = mapType(tm.type_args[0]);
      // Wrap union types in parens for array
      return inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
    }
    return "unknown[]";
  }

  // Dict
  if (t === "dict" || t === "record" || t === "object") {
    if (tm.type_args && tm.type_args.length >= 2) {
      const keyType = mapType(tm.type_args[0]);
      // TS Record keys must be string | number | symbol
      const safeKey = keyType === "unknown" ? "string" : keyType;
      return `Record<${safeKey}, ${mapType(tm.type_args[1])}>`;
    }
    return "Record<string, unknown>";
  }

  // Scalars
  if (t === "str" || t === "string") return "string";
  if (t === "int" || t === "integer" || t === "float" || t === "number")
    return "number";
  if (t === "bool" || t === "boolean") return "boolean";

  // Media refs
  if (MEDIA_TYPES[t]) return MEDIA_TYPES[t];

  // Any / fallback
  if (t === "any" || t === "") return "unknown";

  // model, asset, thread, message, etc. — fallback to unknown
  return "unknown";
}

/** Collect all media ref type names used in a TypeMetadata tree. */
function collectMediaRefs(tm: TypeMetadata, refs: Set<string>): void {
  const t = tm.type.toLowerCase();
  if (MEDIA_TYPES[t]) {
    refs.add(MEDIA_TYPES[t]);
  }
  for (const arg of tm.type_args ?? []) {
    collectMediaRefs(arg, refs);
  }
}

// ---------------------------------------------------------------------------
// Name helpers
// ---------------------------------------------------------------------------

function extractClassName(nodeType: string): string {
  const parts = nodeType.split(".");
  return parts[parts.length - 1];
}

function toCamelCase(s: string): string {
  if (s.length === 0) return s;
  // Handle leading uppercase runs (acronyms): "JSON" → "json", "ASRModel" → "asrModel"
  let i = 0;
  while (
    i < s.length &&
    s[i] === s[i].toUpperCase() &&
    s[i] !== s[i].toLowerCase()
  ) {
    i++;
  }
  if (i === 0) return s;
  if (i === s.length) return s.toLowerCase(); // All caps: "JSON" → "json"
  if (i === 1) return s[0].toLowerCase() + s.slice(1); // Normal: "Add" → "add"
  // Acronym prefix: "ASRModel" → "asrModel" (lowercase all but last uppercase char)
  return s.slice(0, i - 1).toLowerCase() + s.slice(i - 1);
}

function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

function barrelName(namespace: string): string {
  // "nodetool.math" → "math", "kie.image" → "kieImage", "gemini" → "gemini"
  let ns = namespace;
  if (ns.startsWith("nodetool.")) {
    ns = ns.slice("nodetool.".length);
  }
  // camelCase dots: "kie.image" → "kieImage"
  const parts = ns.split(".");
  let name = parts
    .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
    .join("");
  // Avoid TS type keywords as export names (e.g., "boolean", "number")
  if (TS_TYPE_KEYWORDS.has(name)) {
    name = name + "_";
  }
  return name;
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

interface NodeInfo {
  meta: NodeMetadata;
  className: string;
  factoryName: string;
}

/**
 * The exported name per node, positionally aligned with `nodes`: a repeated
 * name takes a trailing `_` per repeat, and a JS reserved word or an
 * `Object.prototype` member takes one too. Both trees read this, so a node is
 * called the same thing in the graph DSL and in the flow surface.
 */
function factoryNamesFor(nodes: NodeInfo[]): string[] {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    counts.set(node.factoryName, (counts.get(node.factoryName) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return nodes.map((node) => {
    let name = node.factoryName;
    if ((counts.get(name) ?? 0) > 1) {
      const before = seen.get(name) ?? 0;
      seen.set(name, before + 1);
      if (before > 0) name = name + "_".repeat(before);
    }
    if (JS_RESERVED.has(name) || BUILTIN_NAMES.has(name)) name = name + "_";
    return name;
  });
}

/** Media ref type names any of these nodes mention, in import order. */
function mediaRefImports(nodes: NodeInfo[]): string[] {
  const refs = new Set<string>();
  for (const { meta } of nodes) {
    for (const prop of meta.properties) collectMediaRefs(prop.type, refs);
    for (const out of meta.outputs) collectMediaRefs(out.type, refs);
  }
  return ALL_MEDIA_IMPORTS.filter((ref) => refs.has(ref));
}

/** Whether a property is optional in the inputs bag. */
function isOptionalProperty(prop: PropertyMetadata): boolean {
  return (
    Object.prototype.hasOwnProperty.call(prop, "default") ||
    prop.type.optional === true ||
    prop.type.type === "optional"
  );
}

function propertyKey(name: string): string {
  return isValidIdentifier(name) ? name : JSON.stringify(name);
}

/**
 * One guest module per namespace: plain-value inputs, no handles, no graph.
 *
 * A `run`-contract node reads every handle as a stream, so its inputs widen to
 * `T | T[]` — arrays only, which is the whole of streaming input in v1.
 */
function generateFlowFile(nodes: NodeInfo[]): string {
  const lines: string[] = [FLOW_HEADER];
  const streaming = nodes.filter(
    ({ meta }) => meta.is_streaming_output || meta.is_streaming_input
  );

  const coreImports = streaming.length > 0 ? "callNode, streamNode" : "callNode";
  lines.push(`import { ${coreImports} } from "../guest-core.js";`);
  const usedMediaRefs = mediaRefImports(nodes);
  if (usedMediaRefs.length > 0) {
    lines.push(
      `import type { ${usedMediaRefs.join(", ")} } from "../../types.js";`
    );
  }
  lines.push("");

  const names = factoryNamesFor(nodes);
  nodes.forEach((node, index) => {
    const { meta, className } = node;
    const callableName = names[index];
    const hasProps = meta.properties.length > 0;
    const runContract = meta.is_streaming_input === true;

    lines.push(`// ${meta.title || className} — ${meta.node_type}`);

    lines.push(`export type ${className}Inputs = {`);
    for (const prop of meta.properties) {
      const base = mapType(prop.type);
      const tsType = runContract
        ? `${base} | ${base.includes("|") ? `(${base})` : base}[]`
        : base;
      lines.push(
        `  ${propertyKey(prop.name)}${isOptionalProperty(prop) ? "?" : ""}: ${tsType};`
      );
    }
    lines.push("};");
    lines.push("");

    lines.push(`export interface ${className}Outputs {`);
    for (const out of meta.outputs) {
      lines.push(`  ${propertyKey(out.name)}: ${mapType(out.type)};`);
    }
    lines.push("}");
    lines.push("");

    const inputsArg = hasProps
      ? `inputs: ${className}Inputs`
      : `inputs?: ${className}Inputs`;
    const inputsExpr = hasProps ? "inputs" : "inputs ?? {}";

    lines.push(
      `export function ${callableName}(${inputsArg}): Promise<${className}Outputs> {`
    );
    lines.push(
      `  return callNode<${className}Outputs>("${meta.node_type}", ${inputsExpr});`
    );
    lines.push("}");
    lines.push("");

    if (meta.is_streaming_output || runContract) {
      // A `run`-contract node emits per slot, so its stream carries
      // `{slot, value}`; a `genProcess` stream carries one partial record per
      // yield. `invokeStream` on the host picks the same two shapes.
      const slotType =
        meta.outputs.length > 0 ? `keyof ${className}Outputs & string` : "string";
      const itemType = runContract
        ? `{ slot: ${slotType}; value: unknown }`
        : `Partial<${className}Outputs>`;
      lines.push(
        `${callableName}.stream = function (${inputsArg}): AsyncIterable<${itemType}> {`
      );
      lines.push(
        `  return streamNode<${itemType}>("${meta.node_type}", ${inputsExpr});`
      );
      lines.push("};");
      lines.push("");
    }
  });

  return lines.join("\n");
}

function generateFile(namespace: string, nodes: NodeInfo[]): string {
  const lines: string[] = [HEADER];

  // Core imports
  const coreImports = ["createNode", "Connectable", "DslNode"];
  lines.push(`import { ${coreImports.join(", ")} } from "../core.js";`);

  // Types imports
  const usedMediaRefs = mediaRefImports(nodes);
  if (usedMediaRefs.length > 0) {
    lines.push(
      `import type { ${usedMediaRefs.join(", ")} } from "../types.js";`
    );
  }

  lines.push("");

  const factoryNames = factoryNamesFor(nodes);

  nodes.forEach((node, nodeIndex) => {
    const { meta, className } = node;
    const factoryName = factoryNames[nodeIndex];

    // Comment
    lines.push(`// ${meta.title || className} — ${meta.node_type}`);

    // --- Inputs type ---
    // A type alias, not an interface: TypeScript infers an implicit index
    // signature for an aliased object literal type, so the inputs bag is
    // assignable to createNode's `Record<string, unknown>` with no cast. An
    // interface never gets that index signature, and one with a required
    // member is not comparable to Record either — that combination is what
    // made the old `inputs as Record<string, unknown>` cast fail to compile.
    const hasProps = meta.properties.length > 0;
    lines.push(`export type ${className}Inputs = {`);
    for (const prop of meta.properties) {
      const tsType = mapType(prop.type);
      const hasDefault = Object.prototype.hasOwnProperty.call(prop, "default");
      const isOptionalType =
        prop.type.optional || prop.type.type === "optional";
      const optional = hasDefault || isOptionalType;
      const propName = isValidIdentifier(prop.name)
        ? prop.name
        : JSON.stringify(prop.name);
      lines.push(
        `  ${propName}${optional ? "?" : ""}: Connectable<${tsType}>;`
      );
    }
    lines.push("};");
    lines.push("");

    // --- Outputs interface ---
    lines.push(`export interface ${className}Outputs {`);
    for (const out of meta.outputs) {
      const tsType = mapType(out.type);
      const outName = isValidIdentifier(out.name)
        ? out.name
        : JSON.stringify(out.name);
      lines.push(`  ${outName}: ${tsType};`);
    }
    lines.push("}");
    lines.push("");

    // --- Factory function ---
    const inputsArg = hasProps
      ? `inputs: ${className}Inputs`
      : `inputs?: ${className}Inputs`;

    // Return type
    const defaultOutput =
      meta.outputs.length === 1 ? JSON.stringify(meta.outputs[0].name) : null;
    const returnType = defaultOutput
      ? `DslNode<${className}Outputs, ${defaultOutput}>`
      : `DslNode<${className}Outputs>`;

    // Static options baked in from node metadata.
    const baseOpts: string[] = [];
    const outputNames = meta.outputs
      .map((out) => JSON.stringify(out.name))
      .join(", ");
    baseOpts.push(`outputNames: [${outputNames}]`);
    if (defaultOutput) baseOpts.push(`defaultOutput: ${defaultOutput}`);
    if (meta.is_streaming_output) baseOpts.push("streaming: true");
    if (meta.is_streaming_input) baseOpts.push("streamingInput: true");
    const inputsExpr = hasProps ? "inputs" : "inputs ?? {}";

    const optsExpr = `{ ${baseOpts.join(", ")} }`;

    lines.push(
      `export function ${factoryName}(${inputsArg}): ${returnType} {`
    );
    lines.push(
      `  return createNode("${meta.node_type}", ${inputsExpr}, ${optsExpr});`
    );
    lines.push("}");
    lines.push("");
  });

  return lines.join("\n");
}

function generateBarrel(namespaces: string[]): string {
  const lines: string[] = [HEADER];
  const sorted = [...namespaces].sort();
  for (const ns of sorted) {
    const fileName = `${ns}.js`;
    const exportName = barrelName(ns);
    lines.push(`export * as ${exportName} from "./${fileName}";`);
  }
  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** One emitted tree: the files a directory must hold, keyed by file name. */
interface GeneratedTree {
  /** `graph` or `flow` — what `--graph` / `--flow` select. */
  id: "graph" | "flow";
  /** Repo-relative directory, for the log lines. */
  label: string;
  dir: string;
  files: Map<string, string>;
  /** Node count per namespace file, for the log line. */
  nodeCounts: Map<string, number>;
}

interface GeneratedOutput {
  trees: GeneratedTree[];
  namespaces: string[];
  totalNodes: number;
}

function generateAll(): GeneratedOutput {
  // Group nodes by namespace
  const byNamespace = new Map<string, NodeInfo[]>();
  let totalNodes = 0;

  for (const nodeClass of ALL_BASE_NODES) {
    let meta: NodeMetadata;
    try {
      meta = getNodeMetadata(nodeClass);
    } catch (e) {
      console.warn(
        `Warning: Failed to get metadata for ${nodeClass.nodeType}: ${e}`
      );
      continue;
    }

    const ns = meta.namespace;
    if (!ns) {
      console.warn(`Warning: No namespace for ${meta.node_type}, skipping`);
      continue;
    }

    const className = extractClassName(meta.node_type);
    const factoryName = toCamelCase(className);

    if (!byNamespace.has(ns)) {
      byNamespace.set(ns, []);
    }
    byNamespace.get(ns)!.push({ meta, className, factoryName });
    totalNodes++;
  }

  const graphFiles = new Map<string, string>();
  const flowFiles = new Map<string, string>();
  const nodeCounts = new Map<string, number>();
  const namespaces: string[] = [];
  for (const [ns, nodes] of byNamespace) {
    graphFiles.set(`${ns}.ts`, generateFile(ns, nodes));
    flowFiles.set(`${ns}.ts`, generateFlowFile(nodes));
    nodeCounts.set(`${ns}.ts`, nodes.length);
    namespaces.push(ns);
  }
  graphFiles.set("index.ts", generateBarrel(namespaces));

  return {
    trees: [
      {
        id: "graph",
        label: "src/generated/",
        dir: GENERATED_DIR,
        files: graphFiles,
        nodeCounts
      },
      {
        id: "flow",
        label: "src/flow/generated/",
        dir: FLOW_GENERATED_DIR,
        files: flowFiles,
        nodeCounts
      }
    ],
    namespaces,
    totalNodes
  };
}

/** Read what is on disk in one tree's directory, keyed by file name. */
function readTree(dir: string): Map<string, string> {
  const onDisk = new Map<string, string>();
  if (!fs.existsSync(dir)) return onDisk;
  for (const file of fs.readdirSync(dir)) {
    onDisk.set(file, fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return onDisk;
}

function write(tree: GeneratedTree, output: GeneratedOutput): void {
  if (fs.existsSync(tree.dir)) {
    for (const file of fs.readdirSync(tree.dir)) {
      fs.unlinkSync(path.join(tree.dir, file));
    }
  } else {
    fs.mkdirSync(tree.dir, { recursive: true });
  }

  for (const [fileName, content] of tree.files) {
    fs.writeFileSync(path.join(tree.dir, fileName), content);
    const count = tree.nodeCounts.get(fileName);
    console.log(
      count === undefined
        ? `  ${tree.label}${fileName}`
        : `  ${tree.label}${fileName} — ${count} nodes`
    );
  }

  console.log(
    `\nDone: ${tree.label} — ${output.namespaces.length} namespace files, ${output.totalNodes} nodes total.`
  );
}

/**
 * Compare one tree against what is checked in. Exits 1 on any difference, so
 * CI catches a DSL that no longer matches the node registry.
 */
function check(tree: GeneratedTree, output: GeneratedOutput): boolean {
  const onDisk = readTree(tree.dir);
  const missing: string[] = [];
  const changed: string[] = [];

  for (const [fileName, content] of tree.files) {
    const current = onDisk.get(fileName);
    if (current === undefined) missing.push(fileName);
    else if (current !== content) changed.push(fileName);
  }
  const extra = [...onDisk.keys()].filter((f) => !tree.files.has(f));

  if (missing.length === 0 && changed.length === 0 && extra.length === 0) {
    console.log(
      `${tree.label} is up to date (${output.namespaces.length} namespaces, ${output.totalNodes} nodes).`
    );
    return true;
  }

  console.error(
    `\n${tree.label} is out of date — the DSL no longer matches the node registry.`
  );
  for (const file of missing.sort()) console.error(`  missing: ${file}`);
  for (const file of extra.sort()) console.error(`  stale:   ${file}`);
  for (const file of changed.sort()) console.error(`  changed: ${file}`);
  return false;
}

function main(): void {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes("--check");
  // No tree flag means both, which is what `npm run codegen` does. The flags
  // exist for working on one tree without rewriting the other.
  const wanted = new Set(
    ["graph", "flow"].filter(
      (id) =>
        argv.includes(`--${id}`) ||
        (!argv.includes("--graph") && !argv.includes("--flow"))
    )
  );

  console.log(`Introspecting ${ALL_BASE_NODES.length} node classes...`);
  const output = generateAll();
  const trees = output.trees.filter((tree) => wanted.has(tree.id));

  if (!checkOnly) {
    for (const tree of trees) write(tree, output);
    return;
  }
  const ok = trees.map((tree) => check(tree, output)).every(Boolean);
  if (!ok) {
    console.error(
      "\nRun `npm run codegen --workspace=packages/dsl` and commit the result."
    );
    process.exit(1);
  }
}

main();
