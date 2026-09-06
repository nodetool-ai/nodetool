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
 * the author. `gate`'s changed-file collection (rename handling, deleted
 * files, base-ref + working-tree merge) lives in ../harness/changed-files.ts;
 * `--timeout <seconds>` bounds each selfcheck (default 900s, fails closed on
 * timeout); a code file no surface claims fails the gate outright, and
 * `--strict` also fails on a touched surface only a gap note covers.
 */
import type { Command } from "commander";
import {
  HARNESSES,
  SURFACES,
  auditHarnessCoverage,
  isUnclaimedPath,
  planGate,
  type GatePlan
} from "../harness/registry.js";
import {
  auditCapabilityCoverage,
  planCapabilityMappingGate
} from "../harness/capability-coverage.js";
import { CAPABILITY_COVERAGE } from "../harness/capability-table.js";
import { declaredCapabilities } from "../harness/declared-capabilities.js";
import {
  collectChangedFiles,
  isGateRelevantCodeFile
} from "../harness/changed-files.js";

/** Sentinel exit code for a selfcheck the gate had to kill on timeout. */
const TIMEOUT_EXIT_CODE = 124;

/** Where the coverage table lives, as git sees it. */
const CAPABILITY_TABLE_PATH =
  "packages/cli/src/harness/capability-table.ts";

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
    .command("capabilities")
    .description(
      "Audit capability coverage: every capability needs a suite, an eval case, or a gap note"
    )
    .option("--json", "Print the audit result as JSON")
    .option("--strict", "Exit non-zero while any capability gap remains")
    .action((opts: { json?: boolean; strict?: boolean }) => {
      const result = auditCapabilityCoverage(
        declaredCapabilities(),
        CAPABILITY_COVERAGE,
        HARNESSES
      );

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(
          `\nCapability coverage: ${result.coveredCount}/${result.rows.length} covered, ${result.gapCount} gap(s)\n`
        );
        for (const row of result.rows) {
          if (!row.covered) {
            console.log(`  GAP  ${row.name.padEnd(32)} ${row.module}`);
          }
        }
        const gaps = result.rows.filter((r) => !r.covered);
        if (gaps.length > 0) {
          console.log("\nDocumented gaps:");
          for (const row of gaps) console.log(`\n  ${row.name}: ${row.gap}`);
        }
        for (const [label, list] of [
          ["Capabilities with no entry", result.unmapped],
          ["Entries naming no capability", result.stale],
          ["Entries with no coverage and no gap note", result.undocumentedGaps],
          ["Entries naming an unknown selfcheck", result.unknownSelfchecks],
          ["Entries claiming a selfcheck with no suite", result.selfchecksWithoutSuites],
          ["Contract drift", result.contractDrift],
          ["Module mismatches", result.moduleMismatches],
          ["Duplicate entries", result.duplicates]
        ] as const) {
          if (list.length > 0) console.log(`\n${label}: ${list.join(", ")}`);
        }
        console.log("");
      }

      const broken =
        result.unmapped.length > 0 ||
        result.stale.length > 0 ||
        result.undocumentedGaps.length > 0 ||
        result.unknownSelfchecks.length > 0 ||
        result.selfchecksWithoutSuites.length > 0 ||
        result.contractDrift.length > 0 ||
        result.moduleMismatches.length > 0 ||
        result.duplicates.length > 0;
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
      "Exit non-zero when the diff touches a surface only a gap note covers"
    )
    .option(
      "--timeout <seconds>",
      "Kill a selfcheck that runs longer than this many seconds (default 900)",
      "900"
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
          timeout?: string;
        }
      ) => {
        const { execSync, spawnSync } = await import("node:child_process");
        const { fileURLToPath } = await import("node:url");
        const { dirname, resolve } = await import("node:path");

        const here = dirname(fileURLToPath(import.meta.url));
        // dist layout: packages/cli/dist/commands → repo root is four up.
        const repoRoot = resolve(here, "..", "..", "..", "..");

        const timeoutSeconds = Number(opts.timeout ?? "900");
        const timeoutMs =
          Number.isFinite(timeoutSeconds) && timeoutSeconds > 0
            ? timeoutSeconds * 1000
            : 900_000;

        let changedFiles = files;
        if (changedFiles.length === 0 && !opts.all) {
          const statusOutput = execSync("git status --porcelain", {
            cwd: repoRoot,
            encoding: "utf8"
          });
          const diffOutput = opts.base
            ? execSync(`git diff --name-only ${opts.base}...HEAD`, {
                cwd: repoRoot,
                encoding: "utf8"
              })
            : undefined;
          changedFiles = collectChangedFiles({
            base: opts.base,
            statusOutput,
            diffOutput
          });
        }

        const mappingViolations = opts.all
          ? []
          : await capabilityMappingViolations(
              repoRoot,
              opts.base ?? "HEAD",
              changedFiles
            );
        if (!opts.json && mappingViolations.length > 0) {
          console.log(
            "\nCapability mapping violations (harness capabilities):"
          );
          for (const v of mappingViolations) console.log(`  ${v}`);
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
        // A directory recorded in UNCLAIMED_PATHS has already been judged: no
        // harness reaches it, and the entry says why. `auditPathClaims` honors
        // that; the gate did not, so the first diff to touch such a directory
        // failed with no way to satisfy it short of inventing a surface.
        const unmappedCodeFiles = plan.unmappedFiles
          .filter(isGateRelevantCodeFile)
          .filter((f) => !isUnclaimedPath(f));

        if (!opts.json) {
          printGatePlan(plan, toRun.length, skippedExpensive.length, opts.all);
          if (unmappedCodeFiles.length > 0) {
            console.log(
              "\nCode files no surface claims (the gate fails on these):"
            );
            for (const f of unmappedCodeFiles) console.log(`  ${f}`);
          }
        }

        if (opts.dryRun) {
          if (opts.json) {
            console.log(
              JSON.stringify(
                { plan, mappingViolations, unmappedCodeFiles },
                null,
                2
              )
            );
          }
          if (
            mappingViolations.length > 0 ||
            unmappedCodeFiles.length > 0 ||
            (opts.strict && plan.uncoveredSurfaces.length > 0)
          ) {
            process.exit(1);
          }
          return;
        }

        const results: Array<{
          harnessId: string;
          command: string;
          ok: boolean;
          exitCode: number;
          timedOut: boolean;
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
            timeout: timeoutMs,
            killSignal: "SIGKILL",
            env: {
              ...process.env,
              ...(nodeOptions
                ? { NODE_OPTIONS: nodeOptions }
                : { NODE_OPTIONS: "" })
            }
          });
          // spawnSync fails closed on a kill: a timeout or any other signal
          // leaves `status` null, which must count as a failure, never as
          // the "no exit code, assume ok" case.
          const timedOut =
            (r.error as NodeJS.ErrnoException | undefined)?.code ===
              "ETIMEDOUT" || r.signal != null;
          const exitCode = timedOut
            ? TIMEOUT_EXIT_CODE
            : (r.status ?? 1);
          if (!opts.json && timedOut) {
            console.log(
              `\nTIMEOUT ${check.harnessId} exceeded ${timeoutSeconds}s: ${check.command}`
            );
          }
          results.push({
            harnessId: check.harnessId,
            command: check.command,
            ok: !timedOut && exitCode === 0,
            exitCode,
            timedOut
          });
        }

        const failed = results.filter((r) => !r.ok);
        if (opts.json) {
          console.log(
            JSON.stringify(
              { plan, results, mappingViolations, unmappedCodeFiles },
              null,
              2
            )
          );
        } else if (toRun.length > 0) {
          console.log(
            `\nGate: ${results.length - failed.length}/${results.length} selfchecks passed`
          );
          for (const r of failed) {
            const label = r.timedOut ? "TIMEOUT" : "FAIL";
            console.log(
              `  ${label} ${r.harnessId} (exit ${r.exitCode}): ${r.command}`
            );
          }
          console.log("");
        }

        if (
          failed.length > 0 ||
          mappingViolations.length > 0 ||
          unmappedCodeFiles.length > 0 ||
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

/**
 * A capability whose declared contract moved without its coverage mapping
 * moving with it. Adding a capability, or changing what one promises, means
 * saying which eval case or suite covers the new contract — a refactor that
 * leaves the contract alone says nothing and runs the mapped checks as usual.
 */
async function capabilityMappingViolations(
  repoRoot: string,
  baseRef: string,
  changedFiles: readonly string[]
): Promise<string[]> {
  const { execSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const atRef = (ref: string): string | null => {
    try {
      return execSync(`git show ${ref}:${CAPABILITY_TABLE_PATH}`, {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch {
      // The table does not exist at that ref — every entry is new.
      return null;
    }
  };

  let working: string;
  try {
    working = readFileSync(join(repoRoot, CAPABILITY_TABLE_PATH), "utf8");
  } catch {
    // Running from a package without the source tree; nothing to compare.
    return [];
  }
  return planCapabilityMappingGate(
    atRef(baseRef),
    working,
    changedFiles
  ).violations.map((v) => v.detail);
}
