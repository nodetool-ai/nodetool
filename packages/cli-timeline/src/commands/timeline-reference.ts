/**
 * `nodetool timeline reference` — render a 3D clip's Blockout reference video.
 *
 * Runs the `render_model3d_reference` timeline op through `edit_timeline`, the
 * path an agent takes, against the local database: the clip's span is drawn by
 * the headless three.js host in grey on a neutral background, encoded to MP4
 * in process, stored as a video asset, and recorded on the clip as
 * `model3dStyle.reference`. A reference that still matches the clip is
 * reused. `--out` also copies the video to a local file.
 */
import type { Command } from "commander";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";

const PASSES = ["clay", "depth", "normal"] as const;
type ReferencePass = (typeof PASSES)[number];

interface TimelineReferenceCliOptions {
  pass?: string;
  out?: string;
  json?: boolean;
}

/** The part of the op result this command reads. */
interface ReferenceOpResult {
  reference?: { assetId: string; dependencyHash: string; pass: string };
  referenceRendered?: boolean;
  cameraMove?: string;
  note?: string;
}

interface EditTimelineResult {
  error?: string;
  failed?: number;
  ops?: Array<{ ok?: boolean; error?: string; result?: ReferenceOpResult }>;
}

export function parseReferencePass(value: string | undefined): ReferencePass | undefined {
  if (value === undefined) {
    return undefined;
  }
  const pass = PASSES.find((candidate) => candidate === value);
  if (!pass) {
    throw new Error(
      `--pass must be one of ${PASSES.join(", ")} (got "${value}").`
    );
  }
  return pass;
}

async function renderReference(
  timelineId: string,
  clip: string,
  options: TimelineReferenceCliOptions
): Promise<void> {
  const pass = parseReferencePass(options.pass);
  const { initDb } = await import("@nodetool-ai/models");
  const { getDefaultAssetsPath, getDefaultDbPath } = await import(
    "@nodetool-ai/config"
  );
  const { ProcessingContext, headlessGate, loadMediaRefBytes } = await import(
    "@nodetool-ai/runtime"
  );
  const { FileStorageAdapter } = await import("@nodetool-ai/storage");
  const { contextSecretAvailability, createCapabilityRun } = await import(
    "@nodetool-ai/agents"
  );

  // `initDb` applies only the baseline schema. Migrate first, or storing the
  // video fails on a column added later.
  const { migrateSqliteDb } = await import("@nodetool-ai/models");
  await migrateSqliteDb(getDefaultDbPath());
  initDb(getDefaultDbPath());
  const context = new ProcessingContext({
    jobId: `timeline-reference-${Date.now()}`,
    workflowId: null,
    userId: "1",
    storage: new FileStorageAdapter(getDefaultAssetsPath())
  });
  // Storing the video needs the asset persistence a local run gets.
  const { localModelInterfaces } = await import(
    "@nodetool-ai/cli-execution/local-model-interfaces"
  );
  context.setModelInterfaces(await localModelInterfaces());
  // The person at the terminal asked for this write.
  const run = createCapabilityRun({
    context,
    gate: headlessGate("nodetool timeline reference"),
    availableSecrets: contextSecretAvailability(context)
  });
  const edited = (await run.invoke("edit_timeline", {
    timeline_id: timelineId,
    ops: [
      {
        op: "render_model3d_reference",
        target: clip,
        ...(pass && { pass })
      }
    ]
  })) as EditTimelineResult;
  const op = edited.ops?.[0];
  if (edited.error || !op || op.ok === false || (edited.failed ?? 0) > 0) {
    throw new Error(
      edited.error ?? op?.error ?? "The reference render did not run."
    );
  }
  const result = op.result ?? {};
  if (!result.reference) {
    throw new Error(
      result.note ?? "This host could not render the reference."
    );
  }

  let outPath: string | undefined;
  if (options.out) {
    const { writeFile } = await import("node:fs/promises");
    const bytes = await loadMediaRefBytes(
      { type: "video", uri: `asset://${result.reference.assetId}.mp4` },
      context
    );
    if (!bytes || bytes.length === 0) {
      throw new Error(
        `The reference asset ${result.reference.assetId} could not be read back.`
      );
    }
    await writeFile(options.out, bytes);
    outPath = options.out;
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          reference: result.reference,
          referenceRendered: result.referenceRendered ?? false,
          ...(result.cameraMove && { cameraMove: result.cameraMove }),
          ...(result.note && { note: result.note }),
          ...(outPath && { out: outPath })
        },
        null,
        2
      )}\n`
    );
    return;
  }
  const { reference } = result;
  process.stdout.write(
    `${result.referenceRendered ? "Rendered" : "Reused"} the ${reference.pass} reference: asset ${reference.assetId}\n`
  );
  if (result.cameraMove) {
    process.stdout.write(`Camera: ${result.cameraMove}\n`);
  }
  if (outPath) {
    process.stdout.write(`Wrote ${outPath}\n`);
  }
}

export function registerTimelineReferenceCommand(timeline: Command): void {
  timeline
    .command("reference <timeline_id> <clip>")
    .description(
      "Render a 3D clip's Blockout reference: a grey video of the clip's span that a video model follows. Takes a timeline_sequences row id and the clip's id or name. Stores the video as an asset and records it on the clip"
    )
    .option(
      "--pass <pass>",
      `${PASSES.join(", ")} (default clay)`
    )
    .option("--out <path>", "Also write the MP4 to this file")
    .option("--json", "Print the op result as JSON")
    .action(
      async (
        timelineId: string,
        clip: string,
        options: TimelineReferenceCliOptions
      ) => {
        try {
          await renderReference(timelineId, clip, options);
        } catch (error) {
          process.exit(printCommandError(error, options.json));
        }
      }
    );
}
