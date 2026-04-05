/**
 * Code generation script for @nodetool/dsl
 *
 * Introspects all registered nodes from @nodetool/base-nodes and emits
 * type-safe factory functions grouped by namespace into packages/dsl/src/generated/.
 *
 * Run: npx tsx packages/dsl/scripts/codegen.ts
 */

import fs from "node:fs";
import path from "node:path";
import { ALL_BASE_NODES } from "@nodetool/base-nodes";
import { getNodeMetadata } from "@nodetool/node-sdk";
import type {
  NodeMetadata,
  PropertyMetadata,
  TypeMetadata,
  OutputSlotMetadata
} from "@nodetool/node-sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GENERATED_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../src/generated"
);

const HEADER = "// Auto-generated — do not edit manually\n";

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

function generateFile(namespace: string, nodes: NodeInfo[]): string {
  const lines: string[] = [HEADER];

  // Determine needed imports
  const mediaRefs = new Set<string>();
  for (const { meta } of nodes) {
    for (const prop of meta.properties) {
      collectMediaRefs(prop.type, mediaRefs);
    }
    for (const out of meta.outputs) {
      collectMediaRefs(out.type, mediaRefs);
    }
  }

  // Core imports
  const coreImports = ["createNode", "Connectable", "DslNode"];
  lines.push(`import { ${coreImports.join(", ")} } from "../core.js";`);

  // Types imports
  const usedMediaRefs = ALL_MEDIA_IMPORTS.filter((r) => mediaRefs.has(r));
  if (usedMediaRefs.length > 0) {
    lines.push(
      `import type { ${usedMediaRefs.join(", ")} } from "../types.js";`
    );
  }

  lines.push("");

  // Track factory name collisions
  const factoryNameCounts = new Map<string, number>();
  for (const node of nodes) {
    factoryNameCounts.set(
      node.factoryName,
      (factoryNameCounts.get(node.factoryName) ?? 0) + 1
    );
  }
  const factoryNameSeen = new Map<string, number>();

  for (const node of nodes) {
    const { meta, className } = node;
    let { factoryName } = node;

    // Handle collisions
    if ((factoryNameCounts.get(factoryName) ?? 0) > 1) {
      const seen = factoryNameSeen.get(factoryName) ?? 0;
      factoryNameSeen.set(factoryName, seen + 1);
      if (seen > 0) {
        factoryName = factoryName + "_".repeat(seen);
      }
    }

    // Avoid JS reserved words and built-in name shadows
    if (JS_RESERVED.has(factoryName) || BUILTIN_NAMES.has(factoryName)) {
      factoryName = factoryName + "_";
    }

    // Comment
    lines.push(`// ${meta.title || className} — ${meta.node_type}`);

    // --- Inputs interface ---
    const hasProps = meta.properties.length > 0;
    lines.push(`export interface ${className}Inputs {`);
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
    lines.push("}");
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

    // Options
    const opts: string[] = [];
    const outputNames = meta.outputs
      .map((out) => JSON.stringify(out.name))
      .join(", ");
    opts.push(`outputNames: [${outputNames}]`);
    if (defaultOutput) opts.push(`defaultOutput: ${defaultOutput}`);
    if (meta.is_streaming_output) opts.push("streaming: true");
    const optsStr = opts.length > 0 ? `, { ${opts.join(", ")} }` : "";

    const castExpr = hasProps
      ? "inputs as Record<string, unknown>"
      : "(inputs ?? {}) as Record<string, unknown>";

    lines.push(`export function ${factoryName}(${inputsArg}): ${returnType} {`);
    lines.push(
      `  return createNode("${meta.node_type}", ${castExpr}${optsStr});`
    );
    lines.push("}");
    lines.push("");
  }

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

function main(): void {
  console.log(`Introspecting ${ALL_BASE_NODES.length} node classes...`);

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

  // Ensure output directory exists and is clean
  if (fs.existsSync(GENERATED_DIR)) {
    // Remove old generated files
    for (const file of fs.readdirSync(GENERATED_DIR)) {
      fs.unlinkSync(path.join(GENERATED_DIR, file));
    }
  } else {
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
  }

  // Generate per-namespace files
  const namespaces: string[] = [];
  for (const [ns, nodes] of byNamespace) {
    const fileName = `${ns}.ts`;
    const filePath = path.join(GENERATED_DIR, fileName);
    const content = generateFile(ns, nodes);
    fs.writeFileSync(filePath, content);
    namespaces.push(ns);
    console.log(`  ${fileName} — ${nodes.length} nodes`);
  }

  // Generate barrel index
  const barrelPath = path.join(GENERATED_DIR, "index.ts");
  fs.writeFileSync(barrelPath, generateBarrel(namespaces));

  console.log(
    `\nDone: ${namespaces.length} namespace files, ${totalNodes} nodes total.`
  );
}

main();
