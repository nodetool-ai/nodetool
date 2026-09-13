#!/usr/bin/env node
/** Detect runtime circular imports in @nodetool-ai/* package source trees. */

import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const packagesDir = resolve(repoRoot, "packages");
const baselinePath = resolve(dirname(scriptPath), "circular-deps-baseline.json");
const sourceExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);

async function getPackageDirs(base) {
  const entries = await readdir(base, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(base, entry.name));
  const checked = await Promise.all(
    candidates.map(async (packageDir) => {
      try {
        await Promise.all([
          access(resolve(packageDir, "src")),
          access(resolve(packageDir, "tsconfig.json"))
        ]);
        return packageDir;
      } catch {
        return null;
      }
    })
  );
  return checked.filter(Boolean);
}

function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function loadProject(packageDir) {
  const configPath = resolve(packageDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(`${configPath}: ${formatDiagnostic(config.error)}`);
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, packageDir, {}, configPath);
  if (parsed.errors.length > 0) {
    throw new Error(`${configPath}: ${parsed.errors.map(formatDiagnostic).join("\n")}`);
  }
  return parsed;
}

function isRuntimeImport(node) {
  if (ts.isImportDeclaration(node)) {
    if (!node.importClause) {
      return true;
    }
    if (node.importClause.isTypeOnly) {
      return false;
    }
    const bindings = node.importClause.namedBindings;
    return !(
      !node.importClause.name &&
      bindings &&
      ts.isNamedImports(bindings) &&
      bindings.elements.every((element) => element.isTypeOnly)
    );
  }
  return ts.isExportDeclaration(node) && !node.isTypeOnly;
}

function moduleSpecifiers(sourceFile) {
  const specifiers = [];
  function visit(node) {
    if (isRuntimeImport(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.push(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return specifiers;
}

function canonicalCycle(cycle) {
  const rotations = cycle.map((_, index) => [
    ...cycle.slice(index),
    ...cycle.slice(0, index)
  ]);
  rotations.sort((left, right) => left.join("\0").localeCompare(right.join("\0")));
  return rotations[0] ?? [];
}

export function findCycles(graph) {
  const cycles = new Map();
  const visited = new Set();
  const active = new Map();
  const stack = [];

  function visit(file) {
    visited.add(file);
    active.set(file, stack.length);
    stack.push(file);
    for (const dependency of graph.get(file) ?? []) {
      const start = active.get(dependency);
      if (start !== undefined) {
        const cycle = canonicalCycle(stack.slice(start));
        cycles.set(cycle.join("\0"), cycle);
      } else if (!visited.has(dependency)) {
        visit(dependency);
      }
    }
    stack.pop();
    active.delete(file);
  }

  for (const file of graph.keys()) {
    if (!visited.has(file)) {
      visit(file);
    }
  }
  return [...cycles.values()];
}

export async function inspectPackage(packageDir) {
  const project = loadProject(packageDir);
  const sourceDir = resolve(packageDir, "src");
  const files = project.fileNames.filter(
    (file) => {
      const sourceRelativePath = relative(sourceDir, file);
      return (
        !sourceRelativePath.startsWith("..") &&
        !isAbsolute(sourceRelativePath) &&
        sourceExtensions.has(extname(file)) &&
        !file.endsWith(".d.ts")
      );
    }
  );
  if (files.length === 0) {
    throw new Error(`${relative(repoRoot, packageDir)}: circular dependency audit inspected no source files`);
  }

  const fileSet = new Set(files.map((file) => resolve(file)));
  const graph = new Map();
  for (const file of fileSet) {
    const text = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(file, text, project.options.target, true);
    const dependencies = new Set();
    for (const specifier of moduleSpecifiers(sourceFile)) {
      const resolvedModule = ts.resolveModuleName(specifier, file, project.options, ts.sys).resolvedModule;
      const resolvedFile = resolvedModule?.resolvedFileName && resolve(resolvedModule.resolvedFileName);
      if (resolvedFile && fileSet.has(resolvedFile)) {
        dependencies.add(resolvedFile);
      }
    }
    graph.set(file, dependencies);
  }
  return { packageDir, files: fileSet.size, cycles: findCycles(graph) };
}

export async function main(args = process.argv.slice(2)) {
  const packageDirs = args.length > 0
    ? args.map((path) => resolve(repoRoot, path))
    : await getPackageDirs(packagesDir);
  if (packageDirs.length === 0) {
    throw new Error("Circular dependency audit inspected no packages");
  }

  const detected = [];
  for (const packageDir of packageDirs) {
    const report = await inspectPackage(packageDir);
    for (const cycle of report.cycles) {
      detected.push(cycle.map((file) => relative(repoRoot, file)));
    }
  }

  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const targetPrefixes = packageDirs.map((packageDir) => `${relative(repoRoot, packageDir)}/`);
  const applicableBaseline = baseline.filter((cycle) =>
    targetPrefixes.some((prefix) => cycle[0]?.startsWith(prefix))
  );
  const baselineKeys = new Set(applicableBaseline.map((cycle) => cycle.join("\0")));
  const detectedKeys = new Set(detected.map((cycle) => cycle.join("\0")));
  const newCycles = detected.filter((cycle) => !baselineKeys.has(cycle.join("\0")));
  const staleBaseline = applicableBaseline.filter((cycle) => !detectedKeys.has(cycle.join("\0")));
  if (newCycles.length > 0 || staleBaseline.length > 0) {
    for (const cycle of newCycles) {
      console.error(`New circular dependency: ${cycle.join(" -> ")} -> ${cycle[0]}`);
    }
    for (const cycle of staleBaseline) {
      console.error(`Resolved circular dependency remains in baseline: ${cycle.join(" -> ")}`);
    }
    console.error(
      "Update scripts/circular-deps-baseline.json only after reviewing the dependency change."
    );
    return 1;
  }
  console.log(`Circular dependency baseline matches across ${packageDirs.length} packages.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
