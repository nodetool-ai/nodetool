/**
 * `nodetool timeline preflight` — check that this machine can export a
 * timeline before a long render starts.
 *
 * It renders a built-in text-and-shape timeline through the same path as
 * `nodetool timeline render`: the GPU compositor and the video encoder. On a
 * headless Linux host without a Vulkan driver the compositor finds no WebGPU
 * adapter, and the report says so with the variables that select a driver.
 */
import type { Command } from "commander";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";
import type { TimelineSequenceRecord } from "../timeline-debug/target.js";
import { runTimelineRender } from "./timeline-render.js";

/** Small enough to render in a second on a software rasterizer. */
const PREFLIGHT_WIDTH = 160;
const PREFLIGHT_HEIGHT = 90;
const PREFLIGHT_FPS = 30;
const PREFLIGHT_DURATION_MS = 200;

/** A shape clip under a text clip, the two clip kinds a graphics-only export needs. */
export function preflightTimeline(): Record<string, unknown> {
  const clip = (id: string, trackId: string, mediaType: "shape" | "text", style: Record<string, unknown>) => ({
    id, name: id, trackId, mediaType, startMs: 0, durationMs: PREFLIGHT_DURATION_MS,
    sourceType: "imported", status: "generated", locked: false, versions: [],
    transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
    ...style
  });
  return {
    name: "nodetool-preflight",
    width: PREFLIGHT_WIDTH,
    height: PREFLIGHT_HEIGHT,
    fps: PREFLIGHT_FPS,
    durationMs: PREFLIGHT_DURATION_MS,
    document: {
      tracks: [
        { id: "text", name: "Text", type: "video", index: 0, visible: true, locked: false },
        { id: "shape", name: "Shape", type: "video", index: 1, visible: true, locked: false }
      ],
      clips: [
        clip("background", "shape", "shape", { shapeStyle: { kind: "rect", x: 0, y: 0, width: 1, height: 1, cornerRadius: 0, fill: "#1f2937" } }),
        clip("title", "text", "text", { textStyle: { text: "NodeTool", fontSizePx: 24, fontWeight: 600, color: "#f9fafb", align: "center", maxWidthFrac: 0.9 } })
      ],
      markers: []
    }
  };
}

export interface TimelinePreflightResult {
  ok: boolean;
  /** The Vulkan driver manifests the loader was pointed at, when set. */
  vulkanDriverFiles: string | null;
  frames?: number;
  width?: number;
  height?: number;
  elapsedMs?: number;
  error?: string;
}

/** Vulkan driver manifests named by the environment; VK_DRIVER_FILES takes precedence, as in the loader. */
export function vulkanDriverFiles(env: NodeJS.ProcessEnv): string | null {
  return env.VK_DRIVER_FILES || env.VK_ICD_FILENAMES || null;
}

export async function runTimelinePreflight(
  render: typeof runTimelineRender = runTimelineRender,
  env: NodeJS.ProcessEnv = process.env
): Promise<TimelinePreflightResult> {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-preflight-"));
  const drivers = vulkanDriverFiles(env);
  try {
    const input = path.join(directory, "preflight.json");
    await fs.writeFile(input, JSON.stringify(preflightTimeline()));
    const noSequence = async (): Promise<TimelineSequenceRecord | null> => null;
    const result = await render(input, { out: path.join(directory, "preflight.mp4"), format: "mp4" }, noSequence);
    const written = await fs.stat(result.out).catch(() => undefined);
    if (!result.complete || !written || written.size === 0) {
      return { ok: false, vulkanDriverFiles: drivers, error: "The preflight render finished without writing a complete video." };
    }
    return { ok: true, vulkanDriverFiles: drivers, frames: result.frames, width: result.width, height: result.height, elapsedMs: result.elapsedMs };
  } catch (error) {
    return { ok: false, vulkanDriverFiles: drivers, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

export function registerTimelinePreflightCommand(timeline: Command): void {
  timeline
    .command("preflight")
    .description("Render a built-in text-and-shape timeline to check that this machine can export video (GPU adapter and encoder). Exits 1 when it cannot")
    .option("--json", "Print the result as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const result = await runTimelinePreflight();
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.ok) {
          console.log(`Timeline export works: ${result.frames} frame(s) at ${result.width}x${result.height} in ${((result.elapsedMs ?? 0) / 1000).toFixed(1)}s.`);
        } else {
          console.log(`Timeline export does not work on this machine: ${result.error}`);
          console.log(`Vulkan driver manifest: ${result.vulkanDriverFiles ?? "not set (VK_DRIVER_FILES)"}`);
          console.log("Install a software Vulkan driver (lavapipe), with or without root: https://github.com/nodetool-ai/nodetool/blob/main/docs/cli.md#headless-linux-rendering");
        }
        process.exit(result.ok ? 0 : 1);
      } catch (e) {
        process.exit(printCommandError(e, opts.json));
      }
    });
}
