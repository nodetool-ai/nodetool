/**
 * `nodetool harness` — list the registry, audit surface coverage, and run
 * the gate.
 *
 * The registry (src/harness/registry.ts) is the source of truth for
 * harness-first engineering: `list` prints every headless harness and what it
 * can do; `audit` prints each product surface with the harnesses covering it
 * and the documented gaps (`--strict` exits non-zero while any gap remains);
 * `gate` maps a diff onto surfaces and runs the selfcheck of every harness
 * covering a touched surface — the checks are selected by the diff, not by
 * the author.
 */
import type { Command } from "commander";
import {
  HARNESSES,
  SURFACES,
  auditHarnessCoverage,
  planGate,
  type GatePlan
} from "../harness/registry.js";

export function registerHarnessCommands(program: Command): void {
  const harness = program
    .command("harness")
    .description("Harness-first engineering: inventory and coverage audit");

  harness
    .command("list")
    .description("List every headless harness and its capabilities")
    .option("--json", "Print the registry as JSON")
    .action((opts: { json?: boolean }) => {
      if (opts.json) {
        console.log(JSON.stringify(HARNESSES, null, 2));
        return;
      }
      console.log(`\n${HARNESSES.length} harnesses:\n`);
      for (const h of HARNESSES) {
        const caps = h.capabilities.length
          ? ` [${h.capabilities.join(", ")}]`
          : "";
        const tool = h.agentTool ? `  (agent tool: ${h.agentTool})` : "";
        console.log(`  ${h.id.padEnd(18)} ${h.kind.padEnd(9)} ${h.title}`);
        console.log(`  ${"".padEnd(18)} ${h.command}${caps}${tool}`);
        console.log("");
      }
      console.log("Docs: docs/HARNESS_FIRST.md\n");
    });

  harness
    .command("audit")
    .description(
      "Audit surface coverage: every surface needs a harness or a documented gap"
    )
    .option("--json", "Print the audit result as JSON")
    .option("--strict", "Exit non-zero while any surface gap remains")
    .action((opts: { json?: boolean; strict?: boolean }) => {
      const result = auditHarnessCoverage();

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          `\nSurface coverage: ${result.coveredCount}/${SURFACES.length} covered, ${result.gapCount} gap(s)\n`
        );
        for (const s of result.surfaces) {
          if (s.covered) {
            console.log(`  ok   ${s.id.padEnd(20)} ${s.harnesses.join(", ")}`);
          } else {
            console.log(`  GAP  ${s.id.padEnd(20)} ${s.title}`);
          }
        }
        const gaps = result.surfaces.filter((s) => !s.covered);
        if (gaps.length > 0) {
          console.log("\nDocumented gaps:");
          for (const s of gaps) console.log(`\n  ${s.id}: ${s.gap}`);
        }
        if (result.undocumentedGaps.length > 0) {
          console.log(
            `\nUNDOCUMENTED gaps (no harness, no gap note): ${result.undocumentedGaps.join(", ")}`
          );
        }
        if (result.unknownHarnessRefs.length > 0) {
          console.log(
            `\nUnknown harness references: ${result.unknownHarnessRefs.join(", ")}`
          );
        }
        if (result.orphanHarnesses.length > 0) {
          console.log(
            `\nHarnesses no surface claims: ${result.orphanHarnesses.join(", ")}`
          );
        }
        console.log("");
      }

      const broken =
        result.undocumentedGaps.length > 0 ||
        result.unknownHarnessRefs.length > 0;
      if (broken || (opts.strict && result.gapCount > 0)) {
        process.exit(1);
      }
    });

  harness
    .command("gate [files...]")
    .description(
      "Map a diff to touched surfaces and run their harnesses' selfchecks"
    )
    .option(
      "--base <ref>",
      "Diff against a git ref (e.g. main) instead of the working tree"
    )
    .option("--all", "Ignore the diff and run every selfcheck")
    .option("--expensive", "Include expensive selfchecks (bundle staging etc.)")
    .option("--dry-run", "Print the plan without running anything")
    .option("--json", "Print the plan (and results, unless --dry-run) as JSON")
    .option(
      "--strict",
      "Exit non-zero when the diff touches a surface no harness covers"
    )
    .action(
      async (
        files: string[],
        opts: {
          base?: string;
          all?: boolean;
          expensive?: boolean;
          dryRun?: boolean;
          json?: boolean;
          strict?: boolean;
        }
      ) => {
        const { execSync, spawnSync } = await import("node:child_process");
        const { fileURLToPath } = await import("node:url");
        const { dirname, resolve } = await import("node:path");

        const here = dirname(fileURLToPath(import.meta.url));
        // dist layout: packages/cli/dist/commands → repo root is four up.
        const repoRoot = resolve(here, "..", "..", "..", "..");

        let changedFiles = files;
        if (changedFiles.length === 0 && !opts.all) {
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

        const plan: GatePlan = opts.all
          ? {
              changedFiles: [],
              surfaces: [],
              checks: HARNESSES.filter((h) => h.selfcheck).map((h) => ({
                harnessId: h.id,
                command: h.selfcheck!.command,
                cost: h.selfcheck!.cost,
                surfaces: []
              })),
              manual: [],
              uncoveredSurfaces: [],
              unmappedFiles: []
            }
          : planGate(changedFiles);

        const toRun = plan.checks.filter(
          (c) => opts.expensive || c.cost === "cheap"
        );
        const skippedExpensive = plan.checks.filter(
          (c) => !opts.expensive && c.cost === "expensive"
        );

        if (!opts.json) {
          printGatePlan(plan, toRun.length, skippedExpensive.length, opts.all);
        }

        if (opts.dryRun) {
          if (opts.json) console.log(JSON.stringify({ plan }, null, 2));
          if (opts.strict && plan.uncoveredSurfaces.length > 0) process.exit(1);
          return;
        }

        const results: Array<{
          harnessId: string;
          command: string;
          ok: boolean;
          exitCode: number;
        }> = [];
        for (const check of toRun) {
          if (!opts.json) {
            console.log(`\n── ${check.harnessId}: ${check.command}\n`);
          }
          // Selfchecks decide their own module resolution: strip the
          // `nodetool-dev` conditions this CLI may be running under (set by
          // `npm run dev:nodetool`), or dist-mode scripts like
          // reliability:ring0 resolve packages to src/ and fail.
          const nodeOptions = (process.env["NODE_OPTIONS"] ?? "")
            .replace(/--conditions[= ]nodetool-dev/g, "")
            .trim();
          const r = spawnSync(check.command, {
            cwd: repoRoot,
            shell: true,
            stdio: opts.json ? "pipe" : "inherit",
            encoding: "utf8",
            env: {
              ...process.env,
              ...(nodeOptions
                ? { NODE_OPTIONS: nodeOptions }
                : { NODE_OPTIONS: "" })
            }
          });
          const exitCode = r.status ?? 1;
          results.push({
            harnessId: check.harnessId,
            command: check.command,
            ok: exitCode === 0,
            exitCode
          });
        }

        const failed = results.filter((r) => !r.ok);
        if (opts.json) {
          console.log(JSON.stringify({ plan, results }, null, 2));
        } else if (toRun.length > 0) {
          console.log(
            `\nGate: ${results.length - failed.length}/${results.length} selfchecks passed`
          );
          for (const r of failed) {
            console.log(`  FAIL ${r.harnessId} (exit ${r.exitCode}): ${r.command}`);
          }
          console.log("");
        }

        if (
          failed.length > 0 ||
          (opts.strict && plan.uncoveredSurfaces.length > 0)
        ) {
          process.exit(1);
        }
      }
    );
}

function printGatePlan(
  plan: GatePlan,
  runCount: number,
  skippedExpensive: number,
  all?: boolean
): void {
  if (all) {
    console.log(
      `\nRunning all ${runCount} selfcheck(s)${skippedExpensive > 0 ? ` (${skippedExpensive} expensive skipped — pass --expensive)` : ""}`
    );
    return;
  }
  if (plan.changedFiles.length === 0) {
    console.log("\nNo changed files — nothing to gate.");
    return;
  }
  console.log(
    `\n${plan.changedFiles.length} changed file(s) touch ${plan.surfaces.length} surface(s):`
  );
  for (const s of plan.surfaces) {
    console.log(`  ${s.id.padEnd(20)} (${s.files.length} file(s))`);
  }
  if (plan.unmappedFiles.length > 0) {
    console.log(`\n${plan.unmappedFiles.length} file(s) outside any surface:`);
    for (const f of plan.unmappedFiles.slice(0, 8)) console.log(`  ${f}`);
    if (plan.unmappedFiles.length > 8) {
      console.log(`  …and ${plan.unmappedFiles.length - 8} more`);
    }
  }
  if (plan.uncoveredSurfaces.length > 0) {
    console.log(
      `\nTouched surfaces with NO harness (documented gaps): ${plan.uncoveredSurfaces.join(", ")}`
    );
  }
  if (plan.manual.length > 0) {
    console.log("\nManual harnesses (need a target/key — run yourself):");
    for (const m of plan.manual) {
      console.log(`  ${m.harnessId.padEnd(18)} ${m.command}`);
    }
  }
  console.log(
    `\n${runCount} selfcheck(s) to run${skippedExpensive > 0 ? ` (${skippedExpensive} expensive skipped — pass --expensive)` : ""}`
  );
}
