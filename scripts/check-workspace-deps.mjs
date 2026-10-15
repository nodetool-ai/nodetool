#!/usr/bin/env node
// Guards against the failure that broke the deploy health check: a package that
// ships to production imports a `@nodetool-ai/*` workspace package it never
// declares in its own `dependencies`. Workspace hoisting hides this locally
// (the package is present in the root node_modules because *something* declares
// it), but the Docker prod stage installs only the pruned closure with
//   npm ci --omit=dev --workspace=@nodetool-ai/websocket --include-workspace-root=false
// so an undeclared import that nothing else pulls in is absent at runtime and
// the server crashes with ERR_MODULE_NOT_FOUND.
//
// This check mirrors that prune exactly: it walks the production dependency
// closure of PROD_ENTRYPOINTS and requires every package in the closure to
// declare each `@nodetool-ai/*` package its source imports at runtime. Erased
// type imports need no production edge. Packages outside
// the closure (e.g. the private *-codegen build tools) are not shipped and are
// intentionally not checked.
//
// An import a package satisfies with its own `declare module "…"` needs no
// dependency: that names a facade the host mounts inside the QuickJS guest, not
// a package npm installs.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Production entrypoints bundled into the Docker image (the Dockerfile build
// stage esbuilds this workspace via scripts/bundle-backend.mjs --profile
// server). Keep in sync if the deployment bundles additional workspaces.
const PROD_ENTRYPOINTS = ["@nodetool-ai/websocket"];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const packagesDir = join(repoRoot, "packages");

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "__tests__", "tests", "test", "coverage"]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/** Reduce a specifier like `@nodetool-ai/code-nodes/nodes/code` to `@nodetool-ai/code-nodes`. */
function workspacePackageName(specifier) {
  if (!specifier.startsWith("@nodetool-ai/")) return null;
  const [scope, name] = specifier.split("/");
  return name ? `${scope}/${name}` : null;
}

async function collectSourceFiles(dir) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      files.push(...(await collectSourceFiles(full)));
    } else if (
      SOURCE_EXTENSIONS.has(full.slice(full.lastIndexOf("."))) &&
      !TEST_FILE.test(entry.name)
    ) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Imported specifiers and ambient module declarations, read by the TypeScript
 * AST: a specifier written in a comment, in a prompt example, or in a
 * snippet of guest code inside a template literal is not an import.
 */
function scanSpecifiers(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imported = [];
  const ambient = [];
  function add(node) {
    if (node && ts.isStringLiteralLike(node)) {
      imported.push(node.text);
    }
  }
  function visit(node) {
    if (ts.isImportTypeNode(node)) {
      return;
    }
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const onlyNamedTypes = !clause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 &&
        bindings.elements.every(element => element.isTypeOnly);
      if (!clause?.isTypeOnly && !onlyNamedTypes) {
        add(node.moduleSpecifier);
      }
    } else if (ts.isExportDeclaration(node)) {
      const onlyNamedTypes = node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 &&
        node.exportClause.elements.every(element => element.isTypeOnly);
      if (!node.isTypeOnly && !onlyNamedTypes) {
        add(node.moduleSpecifier);
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (!node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
        add(node.moduleReference.expression);
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        add(node.arguments[0]);
      }
    } else if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      ambient.push(node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return { imported, ambient };
}

// Load every workspace manifest under packages/.
const manifests = new Map(); // name -> { dir, prodDeps: Set<string> }
for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(packagesDir, entry.name);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  } catch {
    continue;
  }
  if (!manifest.name?.startsWith("@nodetool-ai/")) continue;
  manifests.set(manifest.name, {
    dir,
    prodDeps: new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {})
    ])
  });
}

// Production closure: packages reachable from the entrypoints via prod deps.
const closure = new Set();
const queue = [...PROD_ENTRYPOINTS];
while (queue.length > 0) {
  const name = queue.pop();
  if (closure.has(name)) continue;
  const manifest = manifests.get(name);
  if (!manifest) continue;
  closure.add(name);
  for (const dep of manifest.prodDeps) {
    if (dep.startsWith("@nodetool-ai/") && !closure.has(dep)) queue.push(dep);
  }
}

const violations = [];
let inspectedFiles = 0;

for (const name of closure) {
  const { dir, prodDeps } = manifests.get(name);
  const sourceFiles = await collectSourceFiles(join(dir, "src"));
  inspectedFiles += sourceFiles.length;
  const scans = [];
  // Declared by the package itself, so never resolved from node_modules.
  const ambient = new Set();
  for (const file of sourceFiles) {
    const scan = scanSpecifiers(await readFile(file, "utf8"), file);
    scans.push({ file, imported: scan.imported });
    for (const specifier of scan.ambient) ambient.add(specifier);
  }
  const missing = new Map(); // dep -> example file
  for (const { file, imported } of scans) {
    for (const specifier of imported) {
      if (ambient.has(specifier)) continue;
      const dep = workspacePackageName(specifier);
      if (!dep || dep === name || prodDeps.has(dep)) continue;
      if (!missing.has(dep)) missing.set(dep, file.slice(repoRoot.length + 1));
    }
  }
  for (const [dep, file] of missing) {
    violations.push({ pkg: name, dep, file });
  }
}

if (inspectedFiles === 0) {
  throw new Error("Production dependency audit inspected no source files");
}

if (violations.length > 0) {
  console.error("Undeclared workspace dependencies in the production closure:\n");
  for (const { pkg, dep, file } of violations) {
    console.error(`  ${pkg}: imports "${dep}" (e.g. ${file}) but it is not in dependencies`);
  }
  console.error(
    `\nEach package above ships to production (it is in the closure of ${PROD_ENTRYPOINTS.join(", ")}).\n` +
      "Add the imported package to the importing package's `dependencies` in its package.json,\n" +
      "then run `npm install` to sync package-lock.json. These imports resolve locally via\n" +
      "workspace hoisting but break under the Docker prod prune (npm ci --omit=dev)."
  );
  process.exit(1);
}

console.log(
  `Workspace dependency check passed (${closure.size} packages in the ${PROD_ENTRYPOINTS.join(", ")} production closure).`
);
