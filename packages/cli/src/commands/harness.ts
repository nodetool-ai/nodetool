/**
 * `nodetool harness` — list the harness registry and audit surface coverage.
 *
 * The registry (src/harness/registry.ts) is the source of truth for
 * harness-first engineering: `list` prints every headless harness and what it
 * can do; `audit` prints each product surface with the harnesses covering it
 * and the documented gaps. `audit --strict` exits non-zero while any gap
 * remains — the ratchet a CI job or an agent can pull.
 */
import type { Command } from "commander";
import {
  HARNESSES,
  SURFACES,
  auditHarnessCoverage
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
}
