/**
 * `nodetool affected` — map changed files to the workspaces that need checking.
 *
 * With no file arguments it reads the working-tree changes from git. Prints the
 * affected packages and the minimal build/test commands; `--json` for tooling.
 */
import type { Command } from "commander";
import {
  computeAffected,
  type AffectedResult,
  type PackageInfo
} from "../affected/affected.js";

interface AffectedCliOptions {
  base?: string;
  json?: boolean;
}

export function registerAffectedCommand(program: Command): void {
  program
    .command("affected [files...]")
    .description(
      "Map changed files (or git working-tree changes) to the workspaces that must be rebuilt/tested"
    )
    .option(
      "--base <ref>",
      "Compare against a git ref (e.g. main) instead of the working tree"
    )
    .option("--json", "Print the result as JSON")
    .action(async (files: string[], opts: AffectedCliOptions) => {
      try {
        const { readFileSync, readdirSync, existsSync } = await import(
          "node:fs"
        );
        const { join, resolve, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const { execSync } = await import("node:child_process");

        const here = dirname(fileURLToPath(import.meta.url));
        // dist layout: packages/cli/dist/commands → repo root is four up.
        const repoRoot = resolve(here, "..", "..", "..", "..");
        const packagesDir = join(repoRoot, "packages");

        const packages: PackageInfo[] = [];
        for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const pkgJsonPath = join(packagesDir, entry.name, "package.json");
          if (!existsSync(pkgJsonPath)) continue;
          try {
            const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8")) as {
              name?: string;
              dependencies?: Record<string, string>;
              devDependencies?: Record<string, string>;
            };
            if (!pkg.name) continue;
            const allDeps = {
              ...(pkg.dependencies ?? {}),
              ...(pkg.devDependencies ?? {})
            };
            packages.push({
              name: pkg.name,
              dir: `packages/${entry.name}`,
              internalDeps: Object.keys(allDeps).filter((d) =>
                d.startsWith("@nodetool-ai/")
              )
            });
          } catch {
            // A malformed package.json shouldn't abort the whole mapping.
          }
        }

        let changedFiles = files;
        if (changedFiles.length === 0) {
          const cmd = opts.base
            ? `git diff --name-only ${opts.base}...HEAD`
            : "git status --porcelain";
          const out = execSync(cmd, { cwd: repoRoot, encoding: "utf8" });
          changedFiles = opts.base
            ? out.split("\n").map((l) => l.trim()).filter(Boolean)
            : out
                .split("\n")
                .map((l) => l.slice(3).trim())
                .filter(Boolean);
        }

        const result = computeAffected(changedFiles, packages);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printAffected(result, changedFiles.length);
        }
      } catch (e) {
        console.error(String(e));
        process.exit(1);
      }
    });
}

function printAffected(result: AffectedResult, fileCount: number): void {
  if (fileCount === 0) {
    console.log("\nNo changed files detected.");
    return;
  }
  console.log(
    `\n${result.affected.length} affected workspace(s) from ${fileCount} changed file(s):`
  );
  for (const name of result.affected) {
    const tag = result.changed.includes(name) ? "changed" : "dependent";
    const build = result.needsBuild.includes(name) ? " (rebuild)" : "";
    console.log(`  ${tag.padEnd(9)} ${name}${build}`);
  }
  if (result.unmatched.length > 0) {
    console.log(`\n${result.unmatched.length} file(s) outside any workspace:`);
    for (const f of result.unmatched.slice(0, 10)) console.log(`  ${f}`);
    if (result.unmatched.length > 10) {
      console.log(`  …and ${result.unmatched.length - 10} more`);
    }
  }
  if (result.commands.length > 0) {
    console.log("\nSuggested commands:");
    for (const cmd of result.commands) console.log(`  ${cmd}`);
  } else {
    console.log("\nNo workspace commands needed.");
  }
}
