/**
 * The `app build` debug bundle: everything one build produced, on disk.
 *
 * Same convention as `app debug` — a timestamped directory under
 * `nodetool-debug/` holding the machine-readable report, its human summary, and
 * the raw evidence — plus the two artifacts only a build has: the
 * `ApplicationBundle` it produced and the spec it was measured against. Message
 * streams are filed per interaction, because a build replays several.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { BuildReport } from "@nodetool-ai/agents";

/** Directory name for a target, mirroring `app debug`'s slug rule. */
export function defaultBuildOutDir(ref: string): string {
  const slug =
    ref
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(`nodetool-debug/app-build-${slug}-${stamp}`);
}

/** Where one interaction's runs are filed. */
export const interactionDir = (outDir: string, interaction: string): string =>
  join(outDir, "interactions", interaction.replace(/[^a-zA-Z0-9_-]+/g, "-"));

/** Write one run's raw message stream; returns the path recorded in the report. */
export async function writeRunMessages(
  outDir: string,
  interaction: string,
  runIndex: number,
  messages: ProcessingMessage[]
): Promise<string> {
  const dir = interactionDir(outDir, interaction);
  await mkdir(dir, { recursive: true });
  const relative = `interactions/${interaction.replace(/[^a-zA-Z0-9_-]+/g, "-")}/run-${runIndex + 1}.messages.jsonl`;
  await writeFile(
    join(outDir, relative),
    messages.map((message) => JSON.stringify(message)).join("\n") + "\n",
    "utf8"
  );
  return relative;
}

/**
 * Write the finished bundle. `app.bundle.json` is the deliverable, so it is
 * written only for a build that produced one — a failed build's directory has
 * the report and the evidence, and nothing importable.
 */
export async function writeBuildBundle(
  outDir: string,
  report: BuildReport,
  markdown: string
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "report.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );
  await writeFile(join(outDir, "report.md"), markdown, "utf8");
  await writeFile(
    join(outDir, "spec.json"),
    JSON.stringify(report.spec, null, 2),
    "utf8"
  );
  if (report.bundle) {
    await writeFile(
      join(outDir, "app.bundle.json"),
      JSON.stringify(report.bundle, null, 2),
      "utf8"
    );
  }
}
