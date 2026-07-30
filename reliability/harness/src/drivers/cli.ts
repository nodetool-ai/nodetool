/**
 * CLI driver (§12) — spawns the real `nodetool debug` command (via `tsx`,
 * `spawn-cli.ts`) against the journey's workflow, then converts the debug
 * bundle it writes (`report.json` + `server/messages.jsonl`) into a
 * `RunRecord` with `loadRunRecordFromDebugBundle` (`core/record.ts`, grown by
 * C1 for exactly this "debug bundle round-trips into a RunRecord" purpose).
 *
 * `nodetool debug` has no scripted-interaction surface of its own — it runs a
 * workflow once, start to finish, with a fixed params bag. `supports()`
 * reflects that: only journeys whose interactions are a single `"run"` (or
 * the implicit one every driver assumes when a journey declares none) can
 * run on this surface; `cancel`/`stream_input`/`reconnect` journeys report
 * "not applicable" instead of erroring.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Journey, JourneyInteraction } from "../core/journey.js";
import { loadRunRecordFromDebugBundle, type RunRecord } from "../core/record.js";
import { spawnNodetoolCli } from "./spawn-cli.js";
import type { RunDriver } from "./types.js";

function effectiveInteractions(journey: Journey): JourneyInteraction[] {
  return journey.interactions.length > 0 ? journey.interactions : [{ action: "run" }];
}

/** True when a journey is a single, unscripted `run` — the only shape
 * `nodetool debug` (and so this driver) can execute. Exported for `compare.ts`
 * and tests to check without constructing a driver. */
export function cliDriverSupports(journey: Journey): boolean {
  const interactions = effectiveInteractions(journey);
  return interactions.length === 1 && interactions[0].action === "run";
}

export class CliDriver implements RunDriver {
  readonly name = "cli";

  supports(journey: Journey): boolean {
    return cliDriverSupports(journey);
  }

  async run(journey: Journey): Promise<RunRecord> {
    if (!this.supports(journey)) {
      throw new Error(
        `journey "${journey.manifest.name}": cli driver only supports a single, ` +
          `unscripted "run" interaction — "nodetool debug" has no cancel/` +
          `stream_input/reconnect surface`
      );
    }

    const bundleDir = await mkdtemp(join(tmpdir(), "nodetool-reliability-cli-"));
    try {
      const workflowPath = join(bundleDir, "workflow.json");
      await writeFile(workflowPath, JSON.stringify(journey.workflow), "utf8");

      const timeoutMs = journey.manifest.timeoutMs + 30_000;
      const { code, stdout, stderr } = await spawnNodetoolCli(
        [
          "debug",
          workflowPath,
          "--params",
          JSON.stringify(journey.manifest.params ?? {}),
          "--out",
          bundleDir,
          "--json"
        ],
        timeoutMs
      );

      // `nodetool debug` exits non-zero on a failed/cancelled *journey*
      // outcome too (e.g. error-in-one-branch legitimately expects "failed")
      // — that isn't a driver failure. Only a bundle the harness can't read
      // back is fatal here.
      let record: RunRecord;
      try {
        record = await loadRunRecordFromDebugBundle(bundleDir, {
          journeyId: journey.manifest.name
        });
      } catch (err) {
        throw new Error(
          `journey "${journey.manifest.name}": cli driver produced no readable ` +
            `debug bundle (exit ${code})\n--- stdout ---\n${stdout}\n` +
            `--- stderr ---\n${stderr}\noriginal error: ${String(err)}`
        );
      }

      return {
        ...record,
        surface: this.name,
        params: journey.manifest.params,
        frames: record.frames.map((frame) => ({ ...frame, surface: this.name }))
      };
    } finally {
      await rm(bundleDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
