#!/usr/bin/env node
// Writes node-context-members.json: the members of NodeContext
// (src/node-context.ts), one entry each with its group, kind and declared type.
// The native runner's guest context is checked against this list.
//
//   node packages/runtime-core/scripts/node-context-members.mjs           write
//   node packages/runtime-core/scripts/node-context-members.mjs --check   fail when stale
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = join(packageDir, "src", "node-context.ts");
export const OUTPUT = join(packageDir, "node-context-members.json");
const ROOT = "NodeContext";
const PREFIX = "NodeContext";

const normalize = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/([(<{[]) /g, "$1")
    .replace(/ ([)>}\]])/g, "$1")
    .trim();

/** The members of NodeContext, sorted by name, from the interface source. */
export function nodeContextMembers(source = readFileSync(SOURCE, "utf8")) {
  const file = ts.createSourceFile(SOURCE, source, ts.ScriptTarget.Latest, true);
  const interfaces = new Map();
  for (const statement of file.statements) {
    if (ts.isInterfaceDeclaration(statement)) interfaces.set(statement.name.text, statement);
  }
  const members = new Map();
  const collect = (name) => {
    const declaration = interfaces.get(name);
    if (!declaration) throw new Error(`${name} is not declared in ${SOURCE}`);
    const group = name === ROOT ? "context" : name.slice(PREFIX.length).toLowerCase();
    for (const member of declaration.members) {
      if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) {
        throw new Error(`${name} has a member that is neither a property nor a method: ${member.getText()}`);
      }
      const memberName = member.name.getText(file);
      if (members.has(memberName)) throw new Error(`${memberName} is declared twice in NodeContext`);
      const type = ts.isMethodSignature(member) ? member : member.type;
      if (!type) throw new Error(`${name}.${memberName} has no declared type`);
      const kind = ts.isMethodSignature(member) || ts.isFunctionTypeNode(type) ? "method" : "property";
      const readonly = (member.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword);
      members.set(memberName, {
        name: memberName,
        group,
        kind,
        ...(kind === "property" ? { readonly } : {}),
        type: normalize(type.getText(file))
      });
    }
    for (const clause of declaration.heritageClauses ?? []) {
      for (const base of clause.types) collect(base.expression.getText(file));
    }
  };
  collect(ROOT);
  return [...members.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderMembers(members = nodeContextMembers()) {
  return `${JSON.stringify(
    {
      $comment:
        "Generated from src/node-context.ts by scripts/node-context-members.mjs. Do not edit.",
      members
    },
    null,
    2
  )}\n`;
}

function main(argv) {
  const rendered = renderMembers();
  if (argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUTPUT, "utf8");
    } catch {
      // A missing file is stale.
    }
    if (current !== rendered) {
      console.error(`${OUTPUT} is stale. Run: node packages/runtime-core/scripts/node-context-members.mjs`);
      return 1;
    }
    console.log(`node-context-members.json matches NodeContext.`);
    return 0;
  }
  writeFileSync(OUTPUT, rendered);
  console.log(`Wrote ${OUTPUT}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
