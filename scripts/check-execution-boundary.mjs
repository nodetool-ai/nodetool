#!/usr/bin/env node
// Guards Track A of docs/RELIABILITY_TASKS.md (task A4): `WorkflowRunner`
// construction is meant to live in exactly one place —
// `@nodetool-ai/execution`'s `ExecutionSession` — so every other surface
// (CLI, debug harness, headless job runner, and eventually the WS runner,
// HTTP API, MCP server, DSL, agent runner) goes through the facade instead of
// hand-rolling hydration/executor-resolution/cancellation again. See
// docs/RELIABILITY_ARCHITECTURE.md §7-8.
//
// This check fails CI on any *new* `import { WorkflowRunner } from
// "@nodetool-ai/kernel"` outside `@nodetool-ai/kernel` (the class's own
// package) and `@nodetool-ai/execution` (the facade). The sites that predate
// this rule and haven't migrated yet are grandfathered in ALLOWLIST below —
// that list may only shrink (as A5 and follow-up migrations land), never grow.
//
// Only `src/` is scanned (matching check-workspace-deps.mjs's convention), so
// test suites that construct a real `WorkflowRunner` for integration coverage
// (packages/*/tests/**) are out of scope by construction.

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const packagesDir = join(repoRoot, "packages");

// Packages allowed to import `WorkflowRunner` from `@nodetool-ai/kernel`
// freely: the kernel package itself (it defines the class) and the execution
// facade (the one place Track A wants it constructed).
const ALWAYS_ALLOWED_PACKAGES = new Set(["kernel", "execution"]);

// Grandfathered call sites that predate the A4 dependency lint (task A3
// migrated the CLI, debug harness, and headless job runner off this list).
// Shrink-only: remove an entry here only when that surface migrates onto
// `ExecutionSession` (A5 for the WS runner; follow-up tasks for the rest).
// Do not add new entries — a new direct `WorkflowRunner` construction site
// should use `@nodetool-ai/execution` instead.
// A5 (docs/RELIABILITY_TASKS.md Track A) migrated
// `packages/websocket/src/unified-websocket-runner.ts` onto
// `ExecutionSession` — it no longer imports `WorkflowRunner` at all, so it's
// removed from this list rather than left in place.
// `packages/agents/src/agent-workflow-runner.ts` was flattened into
// `execute-agent-graph.ts`, which now runs its graph through
// `ExecutionSession` — the entry is dropped, not renamed onto the new path.
// `http-api.ts` and `mcp-server.ts` followed: `http-api.ts` runs every
// workflow through `runWorkflow` from `@nodetool-ai/execution/service` and
// only supplies the environment, and `mcp-server.ts` no longer runs workflows
// at all. Neither imports `WorkflowRunner`, so both entries are gone and the
// check now guards those two files.
//
// The three that remain are the ones the execution package's own inventory
// table marks out of scope for the facade — a child runner inside a running
// parent node, the DSL's multi-registry resolver, and the browser runner.
// See packages/execution/README.md.
const ALLOWLIST = new Set([
  "packages/core-nodes/src/nodes/run-inner-graph.ts",
  "packages/dsl/src/core.ts",
  "packages/workflow-runner/src/run.ts"
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "__tests__", "tests", "test", "coverage"]);
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

// Matches a static import from "@nodetool-ai/kernel" — named or `import type`
// — across single- or multi-line `{ ... }` specifier lists. `s` (dotAll) so
// `.` spans newlines inside the braces.
const KERNEL_IMPORT = /import\s+type\s*\{([^}]*)\}\s*from\s*["']@nodetool-ai\/kernel["']|import\s*\{([^}]*)\}\s*from\s*["']@nodetool-ai\/kernel["']/gs;

/** Named bindings pulled from "@nodetool-ai/kernel" in this file, deduped. */
function kernelImportedNames(source) {
  const names = new Set();
  KERNEL_IMPORT.lastIndex = 0;
  let match;
  while ((match = KERNEL_IMPORT.exec(source)) !== null) {
    const body = match[1] ?? match[2] ?? "";
    for (const rawSpecifier of body.split(",")) {
      const specifier = rawSpecifier.trim();
      if (!specifier) continue;
      // Strip a leading `type ` modifier and an `as Alias` rename — we only
      // care about the *imported* name, not what it's bound to locally.
      const withoutType = specifier.replace(/^type\s+/, "");
      const importedName = withoutType.split(/\s+as\s+/)[0].trim();
      if (importedName) names.add(importedName);
    }
  }
  return names;
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

const violations = [];

let packageDirs;
try {
  packageDirs = (await readdir(packagesDir, { withFileTypes: true })).filter((e) => e.isDirectory());
} catch {
  packageDirs = [];
}

for (const entry of packageDirs) {
  if (ALWAYS_ALLOWED_PACKAGES.has(entry.name)) continue;
  const srcDir = join(packagesDir, entry.name, "src");
  for (const file of await collectSourceFiles(srcDir)) {
    const rel = relative(repoRoot, file).replaceAll("\\", "/");
    if (ALLOWLIST.has(rel)) continue;
    const source = await readFile(file, "utf8");
    if (kernelImportedNames(source).has("WorkflowRunner")) {
      violations.push(rel);
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Direct `import { WorkflowRunner } from "@nodetool-ai/kernel"` outside the execution facade:\n'
  );
  for (const file of violations) {
    console.error(`  ${file}`);
  }
  console.error(
    "\nOnly @nodetool-ai/kernel (its own class) and @nodetool-ai/execution\n" +
      "(ExecutionSession, the one facade Track A wants every surface to\n" +
      "construct WorkflowRunner through — see docs/RELIABILITY_ARCHITECTURE.md\n" +
      "§7-8) may import WorkflowRunner directly. Migrate this call site onto\n" +
      "`ExecutionSession.create(...)` from @nodetool-ai/execution instead of\n" +
      "constructing the runner by hand. If this site is a deliberate,\n" +
      "already-tracked exception (see docs/RELIABILITY_TASKS.md Track A), add\n" +
      "it to the shrink-only ALLOWLIST in scripts/check-execution-boundary.mjs\n" +
      "with a comment explaining why — never grow that list for a new site."
  );
  process.exit(1);
}

console.log(
  `Execution boundary check passed (${ALLOWLIST.size} grandfathered site(s), 0 new violations).`
);
