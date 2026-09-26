/**
 * `nodetool timeline render` — render a timeline's picture through the GPU
 * compositor behind the Render Timeline node, from a JSON file or a
 * `timeline_sequences` row id.
 *
 * Outputs an encoded video, individual PNG stills, or one contact-sheet PNG.
 * Stills and sheets show the exported pixels for frame-by-frame review.
 *
 * The picture only. Audio clips are not mixed; the Render Timeline node does
 * that.
 */
import type { Command } from "commander";
import { printCommandError } from "../command-errors.js";
import type { TimelineSequenceRecord } from "../timeline-debug/target.js";

/** A contact sheet past this many frames has cells too small to review. */
const MAX_SHEET_FRAMES = 60;

interface TimelineRenderCliOptions {
  out?: string;
  format?: string;
  frames?: string;
  stills?: boolean;
  sheet?: string | boolean;
  only?: string;
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

/** The clip fields `--only` reads. */
interface SubsetClip {
  id: string;
  name?: string;
  parentId?: string;
  matte?: { sourceClipId: string };
}

/**
 * The clips `--only` renders: every clip whose id or name is in the
 * comma-separated list, the children of a selected group, and what those clips
 * need to render as they do in context — their ancestor groups (whose
 * transforms they inherit) and their matte source clips. Document order is
 * kept. A token that matches no clip is an error.
 */
export function selectClipSubset<T extends SubsetClip>(
  clips: T[],
  list: string
): T[] {
  const tokens = list
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
  if (tokens.length === 0) {
    throw new Error("The --only list is empty.");
  }
  const unmatched = tokens.filter(
    (token) => !clips.some((clip) => clip.id === token || clip.name === token)
  );
  if (unmatched.length > 0) {
    throw new Error(
      `No clip has the id or name ${unmatched.map((t) => `"${t}"`).join(", ")}.`
    );
  }

  const byId = new Map(clips.map((clip) => [clip.id, clip]));
  const children = new Map<string, string[]>();
  for (const clip of clips) {
    if (clip.parentId === undefined) {
      continue;
    }
    const siblings = children.get(clip.parentId) ?? [];
    siblings.push(clip.id);
    children.set(clip.parentId, siblings);
  }

  const kept = new Set<string>();
  const pending: string[] = [];
  // A root brings its whole subtree; everything kept brings its ancestors and
  // its matte source, which is itself a root.
  const addRoot = (id: string): void => {
    const stack = [id];
    while (stack.length > 0) {
      const next = stack.pop();
      if (next === undefined) {
        break;
      }
      if (kept.has(next) || !byId.has(next)) {
        continue;
      }
      kept.add(next);
      pending.push(next);
      stack.push(...(children.get(next) ?? []));
    }
  };
  for (const clip of clips) {
    if (tokens.includes(clip.id) || tokens.includes(clip.name ?? "")) {
      addRoot(clip.id);
    }
  }
  while (pending.length > 0) {
    const next = pending.pop();
    const clip = next === undefined ? undefined : byId.get(next);
    if (clip === undefined) {
      continue;
    }
    if (clip.parentId !== undefined && !kept.has(clip.parentId)) {
      if (byId.has(clip.parentId)) {
        kept.add(clip.parentId);
        pending.push(clip.parentId);
      }
    }
    if (clip.matte) {
      addRoot(clip.matte.sourceClipId);
    }
  }
  return clips.filter((clip) => kept.has(clip.id));
}

/** A coverage row whose Frame cell is not a frame index. */
export interface SkippedCoverageRow {
  /** The row's other cells, joined as they read in the table. */
  row: string;
  value: string;
}

/**
 * Read the frame indices a builder claims from the Markdown table in its
 * leading comment whose last column is "Frame". A row whose Frame cell is not
 * a non-negative integer (a dash for audio, say) is returned in `skipped`.
 * Frames keep table order; `parseFrameSpec` sorts them and checks the range.
 */
export function parseCoverageFrames(source: string): {
  frames: number[];
  skipped: SkippedCoverageRow[];
} {
  const comment: string[] = [];
  let inBlock = false;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (inBlock) {
      if (line.endsWith("*/")) {
        inBlock = false;
      }
      comment.push(line.replace(/\*\/$/, "").replace(/^\*\s?/, ""));
    } else if (line.startsWith("#!") || (line === "" && comment.length === 0)) {
      continue;
    } else if (line.startsWith("//")) {
      comment.push(line.replace(/^\/\/\s?/, ""));
    } else if (line.startsWith("/*")) {
      inBlock = !line.endsWith("*/");
      comment.push(line.replace(/^\/\*+\s?/, "").replace(/\*\/$/, ""));
    } else {
      break;
    }
  }

  const cellsOf = (line: string): string[] =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  const header = comment.findIndex(
    (line) =>
      line.trim().startsWith("|") &&
      cellsOf(line).at(-1)?.toLowerCase() === "frame"
  );
  if (header === -1) {
    throw new Error(
      'The leading comment has no Markdown table whose last column is "Frame".'
    );
  }

  const frames: number[] = [];
  const skipped: SkippedCoverageRow[] = [];
  for (const line of comment.slice(header + 1)) {
    if (!line.trim().startsWith("|")) {
      break;
    }
    const cells = cellsOf(line);
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue;
    }
    const value = cells.at(-1) ?? "";
    if (/^\d+$/.test(value)) {
      frames.push(Number(value));
    } else {
      skipped.push({ row: cells.slice(0, -1).join(" | "), value });
    }
  }
  return { frames, skipped };
}

/** Round a scaled dimension down to an even number, as H.264 requires. */
function evenScaled(size: number, scale: number): number {
  return Math.max(2, Math.floor((size * scale) / 2) * 2);
}

function positiveNumber(
  value: string | undefined,
  flag: string
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
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
 * The shipped `package://` assets in a checkout, which the server serves from
 * `packages/base-nodes/nodetool/assets`. The runtime reads that directory when
 * `NODETOOL_PACKAGE_ASSETS_DIR` names it and otherwise asks a running server,
 * so without this a rendered example's stills need the server up.
 */
async function checkoutPackageAssetsDir(): Promise<string | null> {
  const { existsSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const path = await import("node:path");
  try {
    const entry = createRequire(import.meta.url).resolve("@nodetool-ai/base-nodes");
    const dir = path.resolve(path.dirname(entry), "..", "nodetool", "assets");
    return existsSync(dir) ? dir : null;
  } catch {
    // Not installed beside the CLI: package assets resolve over HTTP.
    return null;
  }
}

/**
 * Resolve clip assets to local files through the local asset store. The
 * database opens on the first asset a clip needs, so a pure motion-graphics
 * timeline renders without one.
 */
async function localAssetResolver(
  workDir: string
): Promise<(assetId: string) => Promise<string | null>> {
  let files:
    | Promise<import("@nodetool-ai/video-nodes/nodes/timeline/assetFiles").AssetFiles>
    | undefined;
  const open = async () => {
    const { initDb } = await import("@nodetool-ai/models");
    const { getDefaultAssetsPath, getDefaultDbPath } =
      await import("@nodetool-ai/config");
    const { ProcessingContext } = await import("@nodetool-ai/runtime");
    const { FileStorageAdapter } = await import("@nodetool-ai/storage");
    const { AssetFiles } = await import(
      "@nodetool-ai/video-nodes/nodes/timeline/assetFiles"
    );
    const packageAssets = await checkoutPackageAssetsDir();
    initDb(getDefaultDbPath());
    const context = new ProcessingContext({
      jobId: `timeline-render-${Date.now()}`,
      workflowId: null,
      userId: "1",
      storage: new FileStorageAdapter(getDefaultAssetsPath()),
      ...(packageAssets && {
        environment: { NODETOOL_PACKAGE_ASSETS_DIR: packageAssets }
      })
    });
    return new AssetFiles(workDir, context);
  };
  return async (assetId: string) => {
    files ??= open();
    return (await files).path(assetId);
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
      "Render a timeline's picture through the GPU compositor the Render Timeline node uses. Takes a timeline JSON file or a timeline_sequences row id. Writes a video, stills, or a contact sheet. Audio is not mixed"
    )
    .option(
      "--out <path>",
      "Output file, or the output directory with loose --stills (default: nodetool-render/<name>.<ext>, <name>-frames/, or <name>-sheet.png)"
    )
    .option("--format <format>", "mp4, webm, mov or png_sequence", "mp4")
    .option(
      "--frames <spec>",
      "Render only these frames: indices and inclusive ranges, e.g. 0-89 or 175,290,380-390, or coverage:<file> for the Frame column of the table in a builder file's leading comment"
    )
    .option(
      "--stills",
      "Write each selected frame as frame_<index>.png instead of encoding a video"
    )
    .option(
      "--sheet [columns]",
      `Write the selected frames as one labelled contact-sheet PNG instead of loose stills (default 3 columns, at most ${MAX_SHEET_FRAMES} frames)`
    )
    .option(
      "--only <clips>",
      "Render only these clips, by comma-separated name or id, with their ancestor groups, the children of a selected group, and their matte sources"
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
          for (const { row, value } of result.coverageSkipped ?? []) {
            console.log(
              `Skipped coverage row "${row}": "${value}" is not a frame index`
            );
          }
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
  sheet: boolean;
  frames: number;
  width: number;
  height: number;
  fps: number;
  elapsedMs: number;
  skippedClips: string[];
  /** Coverage rows `--frames coverage:<file>` could not read a frame from. */
  coverageSkipped?: SkippedCoverageRow[];
}

function sheetColumns(value: string | boolean | undefined): number | undefined {
  if (value === undefined || value === false) {
    return undefined;
  }
  if (value === true) {
    return 3;
  }
  const columns = Number(value);
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error(
      `--sheet takes a whole number of columns (got "${value}").`
    );
  }
  return columns;
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
  const { renderTimelineComposited } =
    await import("@nodetool-ai/video-nodes/nodes/timeline/compositeRender");
  const { resolveTimelineOutput } =
    await import("@nodetool-ai/video-nodes/nodes/timeline/outputFormats");
  const { encodeRgbaPng } =
    await import("@nodetool-ai/video-nodes/nodes/timeline/pngSequence");
  const { contactSheetLayout, createContactSheet } =
    await import("@nodetool-ai/video-nodes/nodes/timeline/contactSheet");

  const resolved = await resolveTimelineTarget(ref, { loadSequence });
  const { target, meta } = resolved;
  const fps = meta.fps && meta.fps > 0 ? meta.fps : 30;
  const scale = positiveNumber(opts.scale, "--scale") ?? 1;
  const sequenceWidth = meta.width && meta.width > 0 ? meta.width : 1920;
  const sequenceHeight = meta.height && meta.height > 0 ? meta.height : 1080;
  const width = evenScaled(sequenceWidth, scale);
  const height = evenScaled(sequenceHeight, scale);
  const durationMs =
    meta.durationMs && meta.durationMs > 0
      ? meta.durationMs
      : resolved.document.clips.reduce(
          (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
          0
        );
  if (durationMs <= 0) {
    throw new Error("The timeline has zero duration: it has no clips.");
  }
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));
  // Duration and frame count come from the whole document, so an --only
  // render keeps the timeline's frame indices.
  const document = opts.only
    ? {
        ...resolved.document,
        clips: selectClipSubset(resolved.document.clips, opts.only)
      }
    : resolved.document;
  let frames: number[] | undefined;
  let coverageSkipped: SkippedCoverageRow[] | undefined;
  if (opts.frames?.startsWith("coverage:")) {
    const file = path.resolve(opts.frames.slice("coverage:".length));
    const coverage = parseCoverageFrames(await fs.readFile(file, "utf8"));
    if (coverage.frames.length === 0) {
      throw new Error(`The coverage table in ${file} names no frame index.`);
    }
    frames = parseFrameSpec(coverage.frames.join(","), totalFrames);
    coverageSkipped = coverage.skipped;
  } else if (opts.frames) {
    frames = parseFrameSpec(opts.frames, totalFrames);
  }
  const columns = sheetColumns(opts.sheet);
  const sheetFrames =
    columns === undefined
      ? undefined
      : (frames ?? Array.from({ length: totalFrames }, (_, frame) => frame));
  if (sheetFrames && sheetFrames.length > MAX_SHEET_FRAMES) {
    throw new Error(
      `A contact sheet of ${sheetFrames.length} frames is too small to review. Pick at most ${MAX_SHEET_FRAMES} with --frames.`
    );
  }
  const stills = opts.stills === true || sheetFrames !== undefined;
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
        sheetFrames
          ? `${slugOf(name)}-sheet.png`
          : stills
            ? `${slugOf(name)}-frames`
            : `${slugOf(name)}.${output.extension}`
      )
  );
  const sheetOutIsDirectory =
    sheetFrames !== undefined &&
    ((await fs.stat(out).catch(() => undefined))?.isDirectory() ||
      opts.out?.endsWith(path.sep));
  const sheetOut = sheetOutIsDirectory
    ? path.join(out, `${slugOf(name)}-sheet.png`)
    : out;
  // A sheet is one file; loose stills fill a directory.
  const stillsDir = stills && !sheetFrames;
  await fs.mkdir(stillsDir ? out : path.dirname(sheetOut), { recursive: true });
  const sheet =
    sheetFrames &&
    createContactSheet(
      contactSheetLayout({
        count: sheetFrames.length,
        columns: columns ?? 3,
        frameWidth: width,
        frameHeight: height
      })
    );
  const sheetCell = new Map(sheetFrames?.map((frame, index) => [frame, index]));

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
      outPath: sheetOut,
      output,
      ...(frames && { frames }),
      ...(stills && {
        writeFrame: async (frame: number, rgba: Uint8Array) => {
          if (sheet) {
            const index = sheetCell.get(frame);
            if (index === undefined) {
              throw new Error(`Rendered frame ${frame} is absent from the sheet selection.`);
            }
            sheet.draw(index, String(frame), rgba, width, height);
            return;
          }
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
    if (sheet) await fs.writeFile(sheetOut, sheet.encode());
    return {
      out: sheetOut,
      format: stills ? "png" : output.format,
      stills,
      sheet: sheet !== undefined,
      frames: selected,
      width,
      height,
      fps,
      elapsedMs: Date.now() - started,
      skippedClips,
      ...(coverageSkipped && { coverageSkipped })
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
