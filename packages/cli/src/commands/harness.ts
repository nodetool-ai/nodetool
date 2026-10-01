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
 * Selfchecks that only re-run workspace test suites `npm run test:affected`
 * already runs (`suiteOnly`) are skipped unless `--include-suites`.
 * `--jobs <n>` runs the cheap selfchecks n at a time, each one's output
 * buffered and printed as one block; expensive selfchecks stay serial.
 *
 * Every import of a built workspace package in this file is lazy, so the
 * planning commands (`list`, `audit`, `gate --dry-run`) work on a tree whose
 * `dist/` is not built (see ../nodetool.ts).
 */
import type { Command } from "commander";
import {
  HARNESSES,
  SURFACES,
  auditHarnessCoverage,
  isUnclaimedPath,
  planGate,
  type GateCheck,
  type GatePlan
} from "../harness/registry.js";
import { readWorkspacePackages } from "../affected/affected.js";
import {
  auditCapabilityCoverage,
  planCapabilityMappingGate,
  resolveGateBaseRef
} from "../harness/capability-coverage.js";
import { CAPABILITY_COVERAGE } from "../harness/capability-table.js";
import {
  readChangedFiles,
  isGateRelevantCodeFile
} from "../harness/changed-files.js";

/** Sentinel exit code for a selfcheck the gate had to kill on timeout. */
const TIMEOUT_EXIT_CODE = 124;

/**
 * How much a selfcheck may print before the gate stops buffering it.
 *
 * `--json` captures each selfcheck's output, and `spawnSync`'s default cap is
 * 1 MB: past that Node kills the child and leaves a signal behind, which the
 * gate read as a timeout. A jest leg covering a whole component tree prints
 * more than that in warnings alone, so a passing suite was reported as
 * "exceeded 900s" after three minutes.
 */
const SELFCHECK_MAX_BUFFER = 256 * 1024 * 1024;

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
    .action(async (opts: { json?: boolean; strict?: boolean }) => {
      // Lazy: declared-capabilities imports the built agents package.
      const { declaredCapabilities } = await import(
        "../harness/declared-capabilities.js"
      );
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
    .option(
      "--include-suites",
      "Also run selfchecks that only re-run suites `npm run test:affected` runs"
    )
    .option(
      "--deps",
      "Also touch surfaces inside workspaces that depend on a changed one"
    )
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
    .option(
      "--jobs <n>",
      "Run up to n cheap selfchecks at once (default 1, serial)",
      "1"
    )
    .action(
      async (
        files: string[],
        opts: {
          base?: string;
          all?: boolean;
          expensive?: boolean;
          includeSuites?: boolean;
          deps?: boolean;
          dryRun?: boolean;
          json?: boolean;
          strict?: boolean;
          timeout?: string;
          jobs?: string;
        }
      ) => {
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
        const jobsRequested = Number(opts.jobs ?? "1");
        const jobs =
          Number.isInteger(jobsRequested) && jobsRequested > 0
            ? jobsRequested
            : 1;

        let changedFiles = files;
        if (changedFiles.length === 0 && !opts.all) {
          changedFiles = readChangedFiles(repoRoot, opts.base);
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
              globalFiles: [],
              surfaces: [],
              checks: HARNESSES.filter((h) => h.selfcheck).map((h) => ({
                harnessId: h.id,
                command: h.selfcheck!.command,
                cost: h.selfcheck!.cost,
                suiteOnly: h.selfcheck!.suiteOnly ?? false,
                surfaces: []
              })),
              manual: [],
              uncoveredSurfaces: [],
              unmappedFiles: []
            }
          : planGate(
              changedFiles,
              undefined,
              undefined,
              opts.deps ? readWorkspacePackages(repoRoot) : undefined
            );

        const { toRun, skippedExpensive, skippedSuites } = selectChecks(
          plan.checks,
          { expensive: opts.expensive, includeSuites: opts.includeSuites }
        );
        // A directory recorded in UNCLAIMED_PATHS has already been judged: no
        // harness reaches it, and the entry says why. `auditPathClaims` honors
        // that; the gate did not, so the first diff to touch such a directory
        // failed with no way to satisfy it short of inventing a surface.
        const unmappedCodeFiles = plan.unmappedFiles
          .filter(isGateRelevantCodeFile)
          .filter((f) => !isUnclaimedPath(f));

        if (!opts.json) {
          printGatePlan(
            plan,
            toRun.length,
            skippedExpensive.length,
            skippedSuites,
            opts.all
          );
          if (unmappedCodeFiles.length > 0) {
            console.log(
              "\nCode files no surface claims (the gate fails on these):"
            );
            for (const f of unmappedCodeFiles) console.log(`  ${f}`);
          }
        }

        const skippedSuiteIds = skippedSuites.map((c) => c.harnessId);

        if (opts.dryRun) {
          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  plan,
                  skippedSuites: skippedSuiteIds,
                  mappingViolations,
                  unmappedCodeFiles
                },
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

        const results = await executeChecks(toRun, {
          repoRoot,
          json: opts.json === true,
          timeoutMs,
          timeoutSeconds,
          jobs
        });

        const failed = results.filter((r) => !r.ok);
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                plan,
                results,
                skippedSuites: skippedSuiteIds,
                mappingViolations,
                unmappedCodeFiles
              },
              null,
              2
            )
          );
        } else if (toRun.length > 0) {
          console.log(
            `\nGate: ${results.length - failed.length}/${results.length} selfchecks passed`
          );
          for (const r of failed) {
            const label = r.timedOut
              ? "TIMEOUT"
              : r.killed
                ? "KILLED"
                : "FAIL";
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

/**
 * Split a plan's checks into what runs now and what is deliberately left out.
 * A suite-only check is skipped (and named) rather than silently dropped:
 * `npm run test:affected` runs the same suites for the same diff, so running
 * them here again is pure repetition unless `--include-suites` asks for it.
 */
export function selectChecks(
  checks: readonly GateCheck[],
  opts: { expensive?: boolean; includeSuites?: boolean }
): {
  toRun: GateCheck[];
  skippedExpensive: GateCheck[];
  skippedSuites: GateCheck[];
} {
  const skippedSuites = checks.filter((c) => c.suiteOnly && !opts.includeSuites);
  const rest = checks.filter((c) => !skippedSuites.includes(c));
  return {
    toRun: rest.filter((c) => opts.expensive || c.cost === "cheap"),
    skippedExpensive: rest.filter((c) => !opts.expensive && c.cost === "expensive"),
    skippedSuites
  };
}

export interface GateCheckResult {
  harnessId: string;
  command: string;
  ok: boolean;
  exitCode: number;
  timedOut: boolean;
  /** Killed by a signal or a spawn error that is not the timeout. */
  killed: boolean;
}

export interface ExecuteChecksOptions {
  repoRoot: string;
  json: boolean;
  timeoutMs: number;
  timeoutSeconds: number;
  jobs: number;
}

/** What one selfcheck did, before the gate interprets it. */
interface RawOutcome {
  status: number | null;
  signal: NodeJS.Signals | null;
  /** `ETIMEDOUT` when the gate's timer fired, else a spawn error's code. */
  errorCode: string | undefined;
  hasError: boolean;
  stdout: string;
  stderr: string;
}

/** Cap on what a failing selfcheck prints into `--json` mode's stderr. */
const FAILURE_OUTPUT_CHARS = 20_000;

/**
 * Selfchecks decide their own module resolution: strip the `nodetool-dev`
 * conditions this CLI may be running under (set by `npm run dev:nodetool`), or
 * dist-mode scripts like reliability:ring0 resolve packages to src/ and fail.
 */
function selfcheckEnv(): NodeJS.ProcessEnv {
  const nodeOptions = (process.env["NODE_OPTIONS"] ?? "")
    .replace(/--conditions[= ]nodetool-dev/g, "")
    .trim();
  return {
    ...process.env,
    ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : { NODE_OPTIONS: "" })
  };
}

/** Run one selfcheck to completion, output inherited (serial, live). */
async function runCheckSync(
  check: GateCheck,
  o: ExecuteChecksOptions
): Promise<RawOutcome> {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(check.command, {
    cwd: o.repoRoot,
    shell: true,
    stdio: o.json ? "pipe" : "inherit",
    encoding: "utf8",
    timeout: o.timeoutMs,
    maxBuffer: SELFCHECK_MAX_BUFFER,
    killSignal: "SIGKILL",
    env: selfcheckEnv()
  });
  return {
    status: r.status,
    signal: r.signal,
    errorCode: (r.error as NodeJS.ErrnoException | undefined)?.code,
    hasError: r.error !== undefined,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? ""
  };
}

/**
 * Run one selfcheck without blocking, buffering its output. A stream keeps only
 * its tail past the cap instead of killing the child, which is what a full
 * pipe did to `spawnSync` (see SELFCHECK_MAX_BUFFER). The child leads its own
 * process group so the timeout's SIGKILL reaches what the shell started, and
 * the result settles at the kill rather than waiting on pipes a grandchild
 * still holds.
 */
async function runCheckAsync(
  check: GateCheck,
  o: ExecuteChecksOptions
): Promise<RawOutcome> {
  const { spawn } = await import("node:child_process");
  const cap = o.json ? FAILURE_OUTPUT_CHARS : SELFCHECK_MAX_BUFFER;
  return new Promise<RawOutcome>((resolveOutcome) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    let settled = false;
    const child = spawn(check.command, {
      cwd: o.repoRoot,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: selfcheckEnv()
    });
    const settle = (
      status: number | null,
      signal: NodeJS.Signals | null
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveOutcome({
        status,
        signal,
        errorCode: timedOut ? "ETIMEDOUT" : spawnError?.code,
        hasError: timedOut || spawnError !== undefined,
        stdout,
        stderr
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      settle(null, "SIGKILL");
    }, o.timeoutMs);
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => {
      stdout += d;
      if (stdout.length > cap) stdout = stdout.slice(-cap);
    });
    child.stderr?.on("data", (d: string) => {
      stderr += d;
      if (stderr.length > cap) stderr = stderr.slice(-cap);
    });
    child.on("error", (e) => {
      spawnError = e;
      settle(null, null);
    });
    child.on("close", (code, signal) => settle(code, signal));
  });
}

/**
 * Turn what a selfcheck did into a result and print its report. `emit` receives
 * the text so a parallel run can print it as one block.
 *
 * Fails closed on a kill: a timeout or any other signal leaves `status` null,
 * which counts as a failure, never as the "no exit code, assume ok" case. Only
 * ETIMEDOUT is reported as a timeout, though — every other signal used to be
 * too, and a check killed for some other reason then claimed to have run for
 * the full `--timeout` when it had run for three minutes.
 */
function interpretOutcome(
  check: GateCheck,
  raw: RawOutcome,
  o: ExecuteChecksOptions
): { result: GateCheckResult; stdoutText: string; stderrText: string } {
  const timedOut = raw.errorCode === "ETIMEDOUT";
  const killed = raw.signal != null || raw.hasError;
  const exitCode = timedOut ? TIMEOUT_EXIT_CODE : (raw.status ?? 1);
  let stderrText = "";
  let stdoutText = "";
  if (o.json && (timedOut || killed || exitCode !== 0)) {
    const output = `${raw.stdout}\n${raw.stderr}`.slice(-FAILURE_OUTPUT_CHARS);
    stderrText = `\n${check.harnessId} failed (exit ${exitCode}):\n${output}\n`;
  }
  if (!o.json && timedOut) {
    stdoutText = `\nTIMEOUT ${check.harnessId} exceeded ${o.timeoutSeconds}s: ${check.command}\n`;
  } else if (!o.json && killed) {
    stdoutText = `\nKILLED ${check.harnessId} (${raw.signal ?? raw.errorCode}): ${check.command}\n`;
  }
  return {
    result: {
      harnessId: check.harnessId,
      command: check.command,
      ok: !timedOut && !killed && exitCode === 0,
      exitCode,
      timedOut,
      killed
    },
    stdoutText,
    stderrText
  };
}

/**
 * Run the selected selfchecks and return their results in plan order.
 *
 * With `jobs` of 1 every check runs serially in plan order with live output.
 * With more, the cheap checks run `jobs` at a time with buffered output
 * printed per check as a block, then the expensive ones run serially: they
 * stage bundles and bind ports, so they cannot share a machine with each other
 * or with the cheap pool.
 */
export async function executeChecks(
  checks: readonly GateCheck[],
  o: ExecuteChecksOptions
): Promise<GateCheckResult[]> {
  const results: GateCheckResult[] = new Array(checks.length);

  const runSerial = async (index: number): Promise<void> => {
    const check = checks[index]!;
    if (!o.json) console.log(`\n── ${check.harnessId}: ${check.command}\n`);
    const { result, stdoutText, stderrText } = interpretOutcome(
      check,
      await runCheckSync(check, o),
      o
    );
    if (stderrText) process.stderr.write(stderrText);
    if (stdoutText) process.stdout.write(stdoutText);
    results[index] = result;
  };

  if (o.jobs <= 1) {
    for (let i = 0; i < checks.length; i++) await runSerial(i);
    return results;
  }

  const cheap: number[] = [];
  const expensive: number[] = [];
  checks.forEach((c, i) => (c.cost === "cheap" ? cheap : expensive).push(i));

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < cheap.length) {
      const index = cheap[next++]!;
      const check = checks[index]!;
      const raw = await runCheckAsync(check, o);
      const { result, stdoutText, stderrText } = interpretOutcome(check, raw, o);
      // One block per check, written without an await in between, so output
      // from checks that finish together does not interleave.
      if (!o.json) {
        process.stdout.write(`\n── ${check.harnessId}: ${check.command}\n\n${raw.stdout}`);
        if (raw.stderr) process.stderr.write(raw.stderr);
      }
      if (stderrText) process.stderr.write(stderrText);
      if (stdoutText) process.stdout.write(stdoutText);
      results[index] = result;
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(o.jobs, cheap.length) }, () => worker())
  );
  for (const index of expensive) await runSerial(index);
  return results;
}

export function printGatePlan(
  plan: GatePlan,
  runCount: number,
  skippedExpensive: number,
  skippedSuites: readonly GateCheck[],
  all?: boolean
): void {
  const skipNote = [
    skippedExpensive > 0
      ? `${skippedExpensive} expensive skipped — pass --expensive`
      : "",
    skippedSuites.length > 0
      ? `${skippedSuites.length} suite-only skipped — pass --include-suites`
      : ""
  ].filter(Boolean);
  const suffix = skipNote.length > 0 ? ` (${skipNote.join("; ")})` : "";
  const printSkippedSuites = (): void => {
    if (skippedSuites.length === 0) return;
    console.log(
      "\nCovered by `npm run test:affected` (selfcheck only re-runs those suites):"
    );
    for (const c of skippedSuites) console.log(`  ${c.harnessId}`);
  };
  if (all) {
    console.log(`\nRunning all ${runCount} selfcheck(s)${suffix}`);
    printSkippedSuites();
    return;
  }
  if (plan.changedFiles.length === 0) {
    console.log("\nNo changed files — nothing to gate.");
    return;
  }
  if (plan.globalFiles.length > 0) {
    console.log(
      `\n${plan.globalFiles.length} global file(s) force every selfcheck:`
    );
    for (const f of plan.globalFiles.slice(0, 8)) console.log(`  ${f}`);
    if (plan.globalFiles.length > 8) {
      console.log(`  …and ${plan.globalFiles.length - 8} more`);
    }
  }
  console.log(
    `\n${plan.changedFiles.length} changed file(s) touch ${plan.surfaces.length} surface(s):`
  );
  for (const s of plan.surfaces) {
    const via = s.viaDependency ? "  (via dependency)" : "";
    console.log(`  ${s.id.padEnd(20)} (${s.files.length} file(s))${via}`);
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
  printSkippedSuites();
  console.log(`\n${runCount} selfcheck(s) to run${suffix}`);
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

  const git = (command: string): string =>
    execSync(command, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });

  const atRef = (ref: string): string | null => {
    try {
      return git(`git show ${ref}:${CAPABILITY_TABLE_PATH}`);
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
    atRef(resolveGateBaseRef(baseRef, git)),
    working,
    changedFiles
  ).violations.map((v) => v.detail);
}
