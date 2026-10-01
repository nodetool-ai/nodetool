#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWED = new Map([
  ["packages/execution/src/session.ts", "canonical server lifecycle"],
  [
    "packages/core-nodes/src/nodes/run-inner-graph.ts",
    "nested run with inherited context"
  ],
  ["packages/workflow-runner/src/run.ts", "portable browser lifecycle"],
  [
    "packages/workflow-runner/e2e/src/browser-entry.ts",
    "browser kernel harness"
  ]
]);
const SKIP = new Set([
  "node_modules",
  "dist",
  "build",
  "__tests__",
  "tests",
  "test",
  "coverage",
  ".git"
]);

/** Find direct kernel runner constructions, including renamed and namespace imports. */
export function runnerConstructions(source, filename) {
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const names = new Set(["WorkflowRunner"]);
  const namespaces = new Set();
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== "@nodetool-ai/kernel"
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === "WorkflowRunner") {
          names.add(binding.name.text);
        }
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
    }
  }
  let count = 0;
  function visit(node) {
    if (ts.isNewExpression(node)) {
      const expression = node.expression;
      if (
        (ts.isIdentifier(expression) && names.has(expression.text)) ||
        (ts.isPropertyAccessExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          namespaces.has(expression.expression.text) &&
          expression.name.text === "WorkflowRunner")
      ) {
        count++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return count;
}

async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) {
        yield* sourceFiles(path);
      }
    } else if (
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.(test|spec)\./.test(entry.name)
    ) {
      yield path;
    }
  }
}

async function main() {
  const violations = [];
  const seen = new Set();
  let inspected = 0;
  for (const dir of ["packages", "web", "electron", "scripts"]) {
    for await (const file of sourceFiles(join(repoRoot, dir))) {
      inspected++;
      const path = relative(repoRoot, file).replaceAll("\\", "/");
      if (!runnerConstructions(await readFile(file, "utf8"), file)) {
        continue;
      }
      seen.add(path);
      if (!ALLOWED.has(path)) {
        violations.push(path);
      }
    }
  }
  for (const path of ALLOWED.keys()) {
    if (!seen.has(path)) {
      violations.push(`Stale execution exception: ${path}`);
    }
  }
  if (inspected === 0) {
    throw new Error("Execution boundary inspected no source files");
  }
  if (violations.length) {
    console.error(
      `Unauthorized kernel runner construction:\n${violations.join("\n")}\nUse ExecutionSession for top-level server runs. See docs/execution-lifecycle.md.`
    );
    process.exitCode = 1;
  } else {
    console.log(`Execution boundary passed (${inspected} files inspected).`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
