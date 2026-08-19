/**
 * The bridge's dependency cone (design §12, D5): only `@nodetool-ai/sdk` and
 * `@nodetool-ai/protocol` from the monorepo. tsconfig references cannot
 * enforce this — npm hoists every workspace into the root node_modules, so
 * `tsc` resolves an import of `@nodetool-ai/agents` whether or not it is
 * referenced — which is why the rule lives here, in the suite the
 * `telegram-bridge` harness selfcheck runs on every touching diff.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED_WORKSPACE_DEPS = new Set([
  "@nodetool-ai/sdk",
  "@nodetool-ai/protocol"
]);

function workspacePackageName(specifier: string): string | null {
  if (!specifier.startsWith("@nodetool-ai/")) {
    return null;
  }
  const [scope, name] = specifier.split("/");
  return name ? `${scope}/${name}` : null;
}

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (/\.[cm]?ts$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("dependency cone", () => {
  it("declares no monorepo dependency beyond sdk and protocol", () => {
    const manifest: unknown = JSON.parse(
      readFileSync(join(packageRoot, "package.json"), "utf-8")
    );
    // SAFETY: our own package.json; the shape is fixed by npm.
    const deps = (manifest as { dependencies?: Record<string, string> })
      .dependencies;
    const workspaceDeps = Object.keys(deps ?? {}).filter((name) =>
      name.startsWith("@nodetool-ai/")
    );
    const forbidden = workspaceDeps.filter(
      (name) => !ALLOWED_WORKSPACE_DEPS.has(name)
    );
    expect(forbidden).toEqual([]);
  });

  it("imports no monorepo package beyond sdk and protocol from src/", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(packageRoot, "src"))) {
      const scan = ts.preProcessFile(readFileSync(file, "utf-8"), true, true);
      for (const imported of scan.importedFiles) {
        const name = workspacePackageName(imported.fileName);
        if (name !== null && !ALLOWED_WORKSPACE_DEPS.has(name)) {
          offenders.push(`${file}: ${imported.fileName}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
