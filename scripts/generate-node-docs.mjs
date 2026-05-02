#!/usr/bin/env node
/**
 * Generate Jekyll-formatted node reference docs by statically parsing
 * TypeScript source files with the TypeScript compiler API.
 *
 * No module evaluation required — works without building the packages.
 *
 * Usage:
 *   node scripts/generate-node-docs.mjs
 *   node scripts/generate-node-docs.mjs --out docs/nodes
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const args = process.argv.slice(2);
let outDir = path.join(repoRoot, "docs", "nodes");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) outDir = args[++i];
}

// Load TypeScript compiler API (globally installed)
const require = createRequire(import.meta.url);
let ts;
try {
  ts = require("/opt/node22/lib/node_modules/typescript/lib/typescript.js");
} catch {
  ts = require(path.join(repoRoot, "node_modules/typescript/lib/typescript.js"));
}

const nodesDir = path.join(repoRoot, "packages/base-nodes/src/nodes");

// ---------------------------------------------------------------------------
// TypeScript AST helpers
// ---------------------------------------------------------------------------

/** Get text of a string literal or template literal node */
function getString(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    // Collapse template literals as best we can
    return node.head.text + "...";
  }
  return null;
}

/** Get the numeric/string value from a literal expression */
function getLiteralValue(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const inner = getLiteralValue(node.operand);
    if (typeof inner === "number") return -inner;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = prop.name.text ?? prop.name.escapedText;
        result[key] = getLiteralValue(prop.initializer);
      }
    }
    return result;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(getLiteralValue);
  }
  return undefined;
}

/** Extract properties from an object literal: { key: value, ... } */
function extractObjectProps(objLiteral) {
  const result = {};
  if (!objLiteral || !ts.isObjectLiteralExpression(objLiteral)) return result;
  for (const prop of objLiteral.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name.text ?? (prop.name.escapedText ? String(prop.name.escapedText) : null);
    if (!key) continue;
    result[key] = getLiteralValue(prop.initializer);
  }
  return result;
}

/** Get text from a multi-line template literal or string literal. */
function getDescriptionText(node) {
  if (!node) return "";
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) {
      s += "{...}" + span.literal.text;
    }
    return s;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Parse a single source file to extract NodeClass metadata
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PropMeta
 * @property {string} name
 * @property {string} type
 * @property {*} default
 * @property {string} description
 * @property {string} title
 */

/**
 * @typedef {Object} OutputMeta
 * @property {string} name
 * @property {string} type
 */

/**
 * @typedef {Object} NodeMeta
 * @property {string} nodeType
 * @property {string} title
 * @property {string} description
 * @property {string} namespace
 * @property {PropMeta[]} properties
 * @property {OutputMeta[]} outputs
 */

/**
 * Parse a TypeScript source file and return NodeMeta for each class found.
 * @param {string} filePath
 * @returns {NodeMeta[]}
 */
function parseNodeFile(filePath) {
  const src = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true);

  /** @type {NodeMeta[]} */
  const results = [];

  function visit(node) {
    if (ts.isClassDeclaration(node) && node.name) {
      const classMeta = extractClassMeta(node, sf, src);
      if (classMeta && classMeta.nodeType) {
        results.push(classMeta);
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
  return results;
}

/**
 * @param {import('typescript').ClassDeclaration} cls
 * @param {import('typescript').SourceFile} sf
 */
function extractClassMeta(cls, sf) {
  let nodeType = null;
  let title = null;
  let description = null;
  /** @type {PropMeta[]} */
  const properties = [];
  /** @type {OutputMeta[]} */
  const outputs = [];

  for (const member of cls.members) {
    // Static readonly nodeType / title / description
    if (
      ts.isPropertyDeclaration(member) &&
      member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) &&
      member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
    ) {
      const nameText = member.name?.text ?? String(member.name?.escapedText ?? "");
      if (nameText === "nodeType" && member.initializer) {
        nodeType = getString(member.initializer);
      }
      if (nameText === "title" && member.initializer) {
        title = getString(member.initializer);
      }
      if (nameText === "description" && member.initializer) {
        description = getDescriptionText(member.initializer);
      }
    }

    // Instance properties decorated with @prop(...)
    if (ts.isPropertyDeclaration(member) && member.modifiers) {
      const decorators = ts.getDecorators ? ts.getDecorators(member) : (member.decorators ?? []);
      if (!decorators) continue;
      for (const dec of decorators) {
        const expr = dec.expression;
        // Check if it's a call expression: @prop({...})
        if (ts.isCallExpression(expr)) {
          const callee = expr.expression;
          const calleeName = ts.isIdentifier(callee) ? callee.text : null;
          if (calleeName !== "prop") continue;

          const arg = expr.arguments[0];
          if (!arg || !ts.isObjectLiteralExpression(arg)) continue;

          const opts = extractObjectProps(arg);
          const propName = member.name?.text ?? String(member.name?.escapedText ?? "");

          properties.push({
            name: propName,
            type: opts.type ?? "any",
            default: opts.default,
            description: opts.description ?? null,
            title: opts.title ?? null,
            min: opts.min ?? null,
            max: opts.max ?? null,
            values: opts.values ?? null,
          });
        }
      }
    }
  }

  // Extract outputs: look for static outputs / metadataOutputTypes / getDeclaredOutputs
  // Pattern: static readonly outputs = { name: "type", ... }
  // or: static readonly metadataOutputTypes = { name: "type", ... }
  for (const member of cls.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
    ) {
      const nameText = member.name?.text ?? String(member.name?.escapedText ?? "");
      if (nameText === "outputs" || nameText === "metadataOutputTypes") {
        if (member.initializer && ts.isObjectLiteralExpression(member.initializer)) {
          for (const prop of member.initializer.properties) {
            if (ts.isPropertyAssignment(prop)) {
              const outputName = prop.name.text ?? String(prop.name.escapedText ?? "");
              const outputType = getString(prop.initializer) ?? "any";
              outputs.push({ name: outputName, type: outputType });
            }
          }
        }
      }
    }
  }

  if (!nodeType) return null;

  const ns = nodeType.includes(".")
    ? nodeType.slice(0, nodeType.lastIndexOf("."))
    : "unknown";

  return {
    nodeType,
    title: title || nodeType.split(".").pop() || nodeType,
    description: description || "",
    namespace: ns,
    properties,
    outputs,
  };
}

// ---------------------------------------------------------------------------
// Walk all node source files
// ---------------------------------------------------------------------------

/** @type {Map<string, NodeMeta[]>} */
const byNamespace = new Map();

function walkDir(dir, collect) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, collect);
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      const nodes = parseNodeFile(full);
      for (const node of nodes) {
        collect(node);
      }
    }
  }
}

walkDir(nodesDir, (node) => {
  if (!byNamespace.has(node.namespace)) byNamespace.set(node.namespace, []);
  byNamespace.get(node.namespace).push(node);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^-+|-+$/g, "");
}

function typeToString(typeStr) {
  return typeStr || "any";
}

function escapeCell(value) {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

function formatDefault(value) {
  if (value === undefined) return "-";
  if (value === null) return "null";
  if (typeof value === "string") {
    const s = value.length > 50 ? `${value.slice(0, 47)}...` : value;
    return `\`${s}\``;
  }
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return `\`${s.length > 50 ? `${s.slice(0, 47)}...` : s}\``;
    } catch {
      return String(value);
    }
  }
  return `\`${value}\``;
}

function nsToPath(ns) {
  return ns.replace(/\./g, "/");
}

function topGroup(ns) {
  return ns.split(".")[0];
}

// ---------------------------------------------------------------------------
// Generate individual node pages
// ---------------------------------------------------------------------------
function generateNodePage(meta) {
  const lines = [];
  lines.push("---");
  lines.push(`layout: page`);
  lines.push(`title: "${meta.title.replace(/"/g, '\\"')}"`);
  lines.push(`node_type: "${meta.nodeType}"`);
  lines.push(`namespace: "${meta.namespace}"`);
  lines.push("---");
  lines.push("");
  lines.push(`**Type:** \`${meta.nodeType}\``);
  lines.push("");
  lines.push(`**Namespace:** \`${meta.namespace}\``);
  lines.push("");

  if (meta.description) {
    lines.push("## Description");
    lines.push("");
    lines.push(meta.description.trim());
    lines.push("");
  }

  lines.push("## Properties");
  lines.push("");
  if (!meta.properties || meta.properties.length === 0) {
    lines.push("_(none)_");
  } else {
    lines.push("| Property | Type | Description | Default |");
    lines.push("|----------|------|-------------|---------|");
    for (const prop of meta.properties) {
      const name = escapeCell(prop.name);
      const type = escapeCell(`\`${typeToString(prop.type)}\``);
      const desc = escapeCell(prop.description ?? "");
      const def = escapeCell(formatDefault(prop.default));
      lines.push(`| ${name} | ${type} | ${desc} | ${def} |`);
    }
  }
  lines.push("");

  lines.push("## Outputs");
  lines.push("");
  if (!meta.outputs || meta.outputs.length === 0) {
    lines.push("_(none)_");
  } else {
    lines.push("| Output | Type | Description |");
    lines.push("|--------|------|-------------|");
    for (const out of meta.outputs) {
      const name = escapeCell(out.name);
      const type = escapeCell(`\`${typeToString(out.type)}\``);
      lines.push(`| ${name} | ${type} |  |`);
    }
  }
  lines.push("");

  lines.push("## Related Nodes");
  lines.push("");
  lines.push(
    `Browse other nodes in the [${meta.namespace}](../) namespace.`
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Generate namespace index pages
// ---------------------------------------------------------------------------
function generateNamespaceIndex(ns, nodes) {
  const lines = [];
  lines.push("---");
  lines.push(`layout: page`);
  lines.push(`title: "${ns} Nodes"`);
  lines.push("---");
  lines.push("");
  lines.push(`This namespace contains ${nodes.length} node(s).`);
  lines.push("");
  lines.push("## Available Nodes");
  lines.push("");

  const sorted = [...nodes].sort((a, b) => a.title.localeCompare(b.title));
  for (const node of sorted) {
    const fileName = `${slugify(node.title)}.md`;
    const shortDesc = (node.description ?? "").split("\n")[0].trim();
    const truncated =
      shortDesc.length > 80 ? `${shortDesc.slice(0, 77)}...` : shortDesc;
    lines.push(
      `- **[${node.title}](${fileName})**${truncated ? ` - ${truncated}` : ""}`
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Generate main index
// ---------------------------------------------------------------------------
function generateMainIndex(nsMap) {
  const groups = new Map();
  for (const [ns] of nsMap) {
    const group = topGroup(ns);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(ns);
  }

  const totalNodes = [...nsMap.values()].reduce(
    (sum, nodes) => sum + nodes.length,
    0
  );
  const totalNs = nsMap.size;

  const lines = [];
  lines.push("---");
  lines.push(`layout: page`);
  lines.push(`title: "Node Reference"`);
  lines.push("---");
  lines.push("");
  lines.push(
    `Complete reference documentation for all ${totalNodes} NodeTool nodes across ${totalNs} namespaces.`
  );
  lines.push("");
  lines.push("## Namespaces");
  lines.push("");

  for (const [group, namespaces] of [...groups.entries()].sort()) {
    lines.push(`### ${group}`);
    lines.push("");
    for (const ns of namespaces.sort()) {
      const nodes = nsMap.get(ns);
      const urlPath = nsToPath(ns);
      lines.push(`- **[${ns}](${urlPath}/)** - ${nodes.length} node(s)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------
let written = 0;

for (const [ns, nodes] of byNamespace) {
  const nsPath = path.join(outDir, nsToPath(ns));
  fs.mkdirSync(nsPath, { recursive: true });

  fs.writeFileSync(
    path.join(nsPath, "index.md"),
    generateNamespaceIndex(ns, nodes)
  );
  written++;

  for (const meta of nodes) {
    const fileName = `${slugify(meta.title)}.md`;
    fs.writeFileSync(path.join(nsPath, fileName), generateNodePage(meta));
    written++;
  }
}

fs.writeFileSync(path.join(outDir, "index.md"), generateMainIndex(byNamespace));
written++;

console.log(
  `Generated ${written} files across ${byNamespace.size} namespaces to ${outDir}`
);
