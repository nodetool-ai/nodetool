/**
 * `nodetool packs compile` — build the guest modules a pack declares by npm
 * dependency name.
 *
 * The CLI's own registry build is synchronous, so it never compiles: it reads
 * the cache and reports a miss as the `pending-compile` diagnostic naming this
 * command. This is where the work actually happens — bundle, scan, probe,
 * cache — and it prints one line per module with the outcome and whether the
 * cache answered.
 */

import type { Command } from "commander";

interface CompileOptions {
  json?: boolean;
  force?: boolean;
  packSearchPath?: string[];
}

export function registerPackCommands(program: Command): void {
  const packs = program.command("packs").description("Sandbox pack tooling");

  packs
    .command("compile")
    .description(
      "Compile every npm-backed sandbox module of every installed pack"
    )
    .option("--json", "Print the compile report as JSON")
    .option(
      "--force",
      "Recompile and re-probe even when the cache has an answer"
    )
    .option(
      "--pack-search-path <dir>",
      "Search this node_modules root (repeatable)",
      (value: string, previous: string[] = []) => [...previous, value]
    )
    .action(async (opts: CompileOptions) => {
      const { compileSandboxCatalog } =
        await import("@nodetool-ai/sandbox-compiler");
      const searchPaths = opts.packSearchPath;
      type CompileOptionsFields = {
        searchPaths?: string[];
        noCache?: boolean;
      };
      const compileOptions: CompileOptionsFields = {};
      if (searchPaths !== undefined && searchPaths.length > 0) {
        compileOptions.searchPaths = searchPaths;
      }
      if (opts.force === true) {
        compileOptions.noCache = true;
      }
      const host = await compileSandboxCatalog(compileOptions);
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              compiled: host.compiled,
              diagnostics: host.catalog.diagnostics()
            },
            null,
            2
          )
        );
        return;
      }
      if (host.compiled.length === 0) {
        console.log("No installed sandbox pack declares an npm module.");
        return;
      }
      let skipped = 0;
      for (const report of host.compiled) {
        if (report.outcome.status === "compiled") {
          const bytes = Buffer.byteLength(
            report.outcome.artifact.source,
            "utf8"
          );
          const from = report.cached ? " (cached)" : "";
          console.log(
            `  ok   ${report.specifier} ← ${report.npmName} — ${bytes} bytes${from}`
          );
          for (const warning of report.outcome.warnings ?? []) {
            console.log(`  warn ${report.specifier} — ${warning}`);
          }
          continue;
        }
        skipped += 1;
        console.log(
          `  skip ${report.specifier} ← ${report.npmName} — ${report.outcome.code}: ${report.outcome.message}`
        );
      }
      console.log(
        `\n${host.compiled.length - skipped} compiled, ${skipped} skipped.`
      );
      if (skipped > 0) process.exitCode = 1;
    });
}
