/**
 * `nodetool timeline render` — render a timeline's picture through the GPU
 * compositor behind the Render Timeline node, from a JSON file or a
 * `timeline_sequences` row id.
 *
 * Two outputs: an encoded video of the selected frames, or `--stills`, one PNG
 * per selected frame named by its timeline index. Stills are how a render gets
 * checked frame by frame: the Canvas 2D preview and the GPU compositor are two
 * renderers, and only this one produces the exported pixels.
 *
 * The picture only. Audio clips are not mixed; the Render Timeline node does
 * that.
 */
import type { Command } from "commander";
import { printCommandError } from "../command-errors.js";
import type { TimelineSequenceRecord } from "../timeline-debug/target.js";

interface TimelineRenderCliOptions {
  out?: string;
  format?: string;
  frames?: string;
  stills?: boolean;
  scale?: string;
  bitrate?: string;
  json?: boolean;
}

/**
 * Parse a frame selection such as `0-89` or `175,290,380-390` into sorted,
 * unique frame indices. Ranges are inclusive. An index at or past
 * `totalFrames` is an error, so a typo does not render an empty selection.
 */
export function parseFrameSpec(spec: string, totalFrames: number): number[] {
  const frames = new Set<number>();
  for (const part of spec.split(",")) {
    const token = part.trim();
    if (token === "") continue;
    const match = /^(\d+)(?:-(\d+))?$/.exec(token);
    if (!match) {
      throw new Error(
        `Invalid frame selection "${token}". Use indices and inclusive ranges, e.g. 175,290,380-390.`
      );
    }
    const first = Number(match[1]);
    const last = match[2] === undefined ? first : Number(match[2]);
    if (last < first) {
      throw new Error(`Frame range "${token}" ends before it starts.`);
    }
    if (last >= totalFrames) {
      throw new Error(
        `Frame ${last} is outside the timeline, which has frames 0-${totalFrames - 1}.`
      );
    }
    for (let frame = first; frame <= last; frame++) frames.add(frame);
  }
  if (frames.size === 0) {
    throw new Error("The frame selection is empty.");
  }
  return [...frames].sort((a, b) => a - b);
}

/** Round a scaled dimension down to an even number, as H.264 requires. */
function evenScaled(size: number, scale: number): number {
  return Math.max(2, Math.floor((size * scale) / 2) * 2);
}

function positiveNumber(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number (got "${value}").`);
  }
  return parsed;
}

/** A file-system-safe name for the default output path. */
function slugOf(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "timeline";
}

/**
 * Resolve clip assets to local files through the local asset store. The
 * database opens on the first asset a clip needs, so a pure motion-graphics
 * timeline renders without one.
 */
async function localAssetResolver(
  workDir: string
): Promise<(assetId: string) => Promise<string | null>> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  let context:
    | Promise<import("@nodetool-ai/runtime").ProcessingContext>
    | undefined;
  const openContext = async (): Promise<
    import("@nodetool-ai/runtime").ProcessingContext
  > => {
    const { initDb } = await import("@nodetool-ai/models");
    const { getDefaultAssetsPath, getDefaultDbPath } =
      await import("@nodetool-ai/config");
    const { ProcessingContext } = await import("@nodetool-ai/runtime");
    const { FileStorageAdapter } = await import("@nodetool-ai/storage");
    initDb(getDefaultDbPath());
    return new ProcessingContext({
      jobId: `timeline-render-${Date.now()}`,
      workflowId: null,
      userId: "1",
      storage: new FileStorageAdapter(getDefaultAssetsPath())
    });
  };
  return async (assetId: string) => {
    context ??= openContext();
    const ctx = await context;
    const local = await ctx.localPath(assetId);
    if (local) return local;
    const { bytes } = await ctx.resolveAssetBytes(assetId);
    if (!bytes) return null;
    const file = path.join(workDir, `asset_${assetId}`);
    await fs.writeFile(file, bytes);
    return file;
  };
}

export function registerTimelineRenderCommand(
  timeline: Command,
  loadSequence: () => Promise<
    (id: string) => Promise<TimelineSequenceRecord | null>
  >
): void {
  timeline
    .command("render <timeline_id_or_file>")
    .description(
      "Render a timeline's picture through the GPU compositor the Render Timeline node uses. Takes a timeline JSON file or a timeline_sequences row id. Writes a video, or with --stills one PNG per frame. Audio is not mixed"
    )
    .option(
      "--out <path>",
      "Output file, or the output directory with --stills (default: nodetool-render/<name>.<ext>, or nodetool-render/<name>-frames/)"
    )
    .option("--format <format>", "mp4, webm, mov or png_sequence", "mp4")
    .option(
      "--frames <spec>",
      "Render only these frames: indices and inclusive ranges, e.g. 0-89 or 175,290,380-390"
    )
    .option(
      "--stills",
      "Write each selected frame as frame_<index>.png instead of encoding a video"
    )
    .option(
      "--scale <n>",
      "Render at this fraction of the sequence size, e.g. 0.5 for a fast draft",
      "1"
    )
    .option("--bitrate <bps>", "Video bitrate in bits per second")
    .option("--json", "Print the result as JSON")
    .action(async (ref: string, opts: TimelineRenderCliOptions) => {
      try {
        const result = await runTimelineRender(ref, opts, await loadSequence());
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(
            `${result.frames} frame(s) at ${result.width}x${result.height} in ${(result.elapsedMs / 1000).toFixed(1)}s -> ${result.out}`
          );
          if (result.skippedClips.length > 0) {
            console.log(`Skipped clips: ${result.skippedClips.join(", ")}`);
          }
        }
        process.exit(0);
      } catch (e) {
        printCommandError(e, opts.json);
        process.exit(1);
      }
    });
}

interface TimelineRenderResult {
  out: string;
  format: string;
  stills: boolean;
  frames: number;
  width: number;
  height: number;
  fps: number;
  elapsedMs: number;
  skippedClips: string[];
}

async function runTimelineRender(
  ref: string,
  opts: TimelineRenderCliOptions,
  loadSequence: (id: string) => Promise<TimelineSequenceRecord | null>
): Promise<TimelineRenderResult> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { resolveTimelineTarget } = await import("../timeline-debug/target.js");
  const { renderTimelineComposited } = await import(
    "@nodetool-ai/video-nodes/nodes/timeline/compositeRender"
  );
  const { resolveTimelineOutput } = await import(
    "@nodetool-ai/video-nodes/nodes/timeline/outputFormats"
  );
  const { encodeRgbaPng } = await import(
    "@nodetool-ai/video-nodes/nodes/timeline/pngSequence"
  );

  const { target, document, meta } = await resolveTimelineTarget(ref, {
    loadSequence
  });
  const fps = meta.fps && meta.fps > 0 ? meta.fps : 30;
  const scale = positiveNumber(opts.scale, "--scale") ?? 1;
  const sequenceWidth = meta.width && meta.width > 0 ? meta.width : 1920;
  const sequenceHeight = meta.height && meta.height > 0 ? meta.height : 1080;
  const width = evenScaled(sequenceWidth, scale);
  const height = evenScaled(sequenceHeight, scale);
  const durationMs =
    meta.durationMs && meta.durationMs > 0
      ? meta.durationMs
      : document.clips.reduce(
          (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
          0
        );
  if (durationMs <= 0) {
    throw new Error("The timeline has zero duration: it has no clips.");
  }
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  const frames = opts.frames
    ? parseFrameSpec(opts.frames, totalFrames)
    : undefined;
  const stills = opts.stills === true;
  const bitrate = positiveNumber(opts.bitrate, "--bitrate");
  const output = resolveTimelineOutput({
    format: opts.format,
    ...(bitrate !== undefined && { bitrate })
  });

  const name = target.name ?? path.basename(ref).replace(/\.json$/i, "");
  const out = path.resolve(
    opts.out ??
      path.join(
        "nodetool-render",
        stills ? `${slugOf(name)}-frames` : `${slugOf(name)}.${output.extension}`
      )
  );
  await fs.mkdir(stills ? out : path.dirname(out), { recursive: true });

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-render-"));
  const now = new Date().toISOString();
  const selected = frames?.length ?? totalFrames;
  let lastTenth = -1;
  const started = Date.now();
  try {
    console.error(
      `Rendering ${selected} frame(s) at ${width}x${height}. The first frame compiles the GPU pipelines and can take a while.`
    );
    const { skippedClips } = await renderTimelineComposited({
      sequence: {
        id: target.kind === "id" ? ref : slugOf(name),
        projectId: "cli",
        name,
        fps,
        width: sequenceWidth,
        height: sequenceHeight,
        durationMs,
        ...document,
        createdAt: now,
        updatedAt: now
      },
      width,
      height,
      fps,
      durationMs,
      resolveAssetPath: await localAssetResolver(workDir),
      outPath: out,
      output,
      ...(frames && { frames }),
      ...(stills && {
        writeFrame: async (frame: number, rgba: Uint8Array) => {
          const file = path.join(
            out,
            `frame_${String(frame).padStart(6, "0")}.png`
          );
          await fs.writeFile(file, encodeRgbaPng(rgba, width, height));
        }
      }),
      onProgress: (done, total) => {
        const tenth = Math.floor((done / total) * 10);
        if (tenth !== lastTenth) {
          lastTenth = tenth;
          console.error(`frame ${done}/${total}`);
        }
      }
    });
    return {
      out,
      format: stills ? "png" : output.format,
      stills,
      frames: selected,
      width,
      height,
      fps,
      elapsedMs: Date.now() - started,
      skippedClips
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
