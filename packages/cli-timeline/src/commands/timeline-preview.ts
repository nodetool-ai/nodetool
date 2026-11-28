/**
 * `nodetool timeline preview` — serve a timeline or a storyboard as a web page
 * for review on a machine with no display, such as a cloud box an agent runs
 * NodeTool on.
 *
 * Timeline frames come from the export compositor through
 * `runTimelineRender`, so the page shows the pixels an export writes. A
 * storyboard shows each shot's selected still and take from the local asset
 * store. The page follows edits to the file or the row.
 */
import { randomBytes } from "node:crypto";
import type { Command } from "commander";
import { printCommandError } from "@nodetool-ai/pack-manager/command-errors";
import type { TimelineSequenceRecord } from "../timeline-debug/target.js";
import type { PreviewRenderer } from "../preview/server.js";
import type { StoryboardRecord } from "../preview/source.js";
import { runTimelineRender } from "./timeline-render.js";

export const DEFAULT_PREVIEW_PORT = 7790;

interface TimelinePreviewCliOptions {
  host: string;
  port: string;
  scale: string;
  token?: string;
  json?: boolean;
}

/** Whether `host` only accepts connections from this machine. */
export function isLoopbackHost(host: string): boolean {
  return host === "localhost" || host === "::1" || /^127\.\d+\.\d+\.\d+$/.test(host);
}

/**
 * The access token: the one given, or a random one when the server listens
 * beyond loopback. A loopback server without `--token` needs none.
 */
export function previewToken(host: string, given: string | undefined): string | undefined {
  if (given !== undefined) {
    if (given.trim() === "") throw new Error("--token must not be empty.");
    return given;
  }
  return isLoopbackHost(host) ? undefined : randomBytes(16).toString("hex");
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be a whole number from 0 to 65535 (got "${value}").`);
  }
  return port;
}

function parseScale(value: string): number {
  const scale = Number(value);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
    throw new Error(`--scale must be a number in (0, 1] (got "${value}").`);
  }
  return scale;
}

/** Render frames and videos through `timeline render` into a private directory. */
export function timelinePreviewRenderer(
  ref: string,
  loadSequence: (id: string) => Promise<TimelineSequenceRecord | null>,
  workDir: string,
  render: typeof runTimelineRender = runTimelineRender
): PreviewRenderer {
  return {
    async frames(frames, scale) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const out = await fs.mkdtemp(path.join(workDir, "frames-"));
      try {
        await render(ref, { frames: frames.join(","), stills: true, out, scale: String(scale) }, loadSequence);
        const pictures = new Map<number, Uint8Array>();
        for (const frame of frames) {
          const file = path.join(out, `frame_${String(frame).padStart(6, "0")}.png`);
          const png = await fs.readFile(file).catch(() => undefined);
          if (png) pictures.set(frame, png);
        }
        return pictures;
      } finally {
        await fs.rm(out, { recursive: true, force: true });
      }
    },
    async video(scale, version) {
      const path = await import("node:path");
      const out = path.join(workDir, `video-${version}-${scale}.mp4`);
      await render(ref, { out, format: "mp4", scale: String(scale) }, loadSequence);
      return out;
    }
  };
}

async function storyboardLoader(): Promise<(id: string) => Promise<StoryboardRecord | null>> {
  const { initDb, Storyboard } = await import("@nodetool-ai/models");
  const { getDefaultDbPath } = await import("@nodetool-ai/config");
  let ready = false;
  return async (id: string) => {
    if (!ready) {
      initDb(getDefaultDbPath());
      ready = true;
    }
    const row = await Storyboard.findById(id);
    return row ? { id: row.id, name: row.name, timeline_id: row.timeline_id, document: row.document } : null;
  };
}

export function registerTimelinePreviewCommand(
  timeline: Command,
  loadSequence: () => Promise<(id: string) => Promise<TimelineSequenceRecord | null>>
): void {
  timeline
    .command("preview <timeline_or_storyboard>")
    .description(
      "Serve a web page that previews a timeline (frames rendered by the export compositor, a thumbnail strip, the track layout, an on-demand video) or a storyboard (each shot's still and take). Takes a timeline or storyboard JSON file, a timeline_sequences row id, or a storyboards row id. The page follows edits until Ctrl+C"
    )
    .option("--host <host>", "Listen address. Use 0.0.0.0 to reach it from another machine, which turns on a token", "127.0.0.1")
    .option("--port <port>", `Listen port, or 0 for any free port`, String(DEFAULT_PREVIEW_PORT))
    .option("--scale <n>", "Frame size as a fraction of the sequence size", "0.5")
    .option("--token <token>", "Require this access token (default: a random token when --host is not loopback)")
    .option("--json", "Print {url, port, token, kind, name} as one JSON line when the server is ready")
    .action(async (ref: string, opts: TimelinePreviewCliOptions) => {
      try {
        const fs = await import("node:fs/promises");
        const os = await import("node:os");
        const path = await import("node:path");
        const { loadPreviewSource } = await import("../preview/source.js");
        const { startPreviewServer } = await import("../preview/server.js");
        const { runTimelineValidate } = await import("../timeline-debug/index.js");
        const { localAssetResolver } = await import("./timeline-render.js");

        const port = parsePort(opts.port);
        const scale = parseScale(opts.scale);
        const token = previewToken(opts.host, opts.token);
        const sequences = await loadSequence();
        const storyboards = await storyboardLoader();
        const deps = {
          loadSequence: sequences,
          loadStoryboard: storyboards,
          validate: async (target: string) => (await runTimelineValidate(target, { loadSequence: sequences })).validation
        };
        // Fail before listening when the target does not resolve.
        const first = await loadPreviewSource(ref, deps);

        const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-preview-"));
        const started = await startPreviewServer({
          host: opts.host,
          port,
          scale,
          ...(token !== undefined && { token }),
          load: () => loadPreviewSource(ref, deps),
          render: timelinePreviewRenderer(ref, sequences, workDir),
          assetPath: await localAssetResolver(workDir),
          onLog: (line) => console.error(line)
        }).catch((error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === "EADDRINUSE") {
            throw new Error(`Port ${port} is already in use. Pass --port with another port, or --port 0 for any free one.`);
          }
          throw error;
        });

        const stop = (): void => {
          void started.close().finally(() =>
            fs.rm(workDir, { recursive: true, force: true }).finally(() => process.exit(0))
          );
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);

        if (opts.json) {
          console.log(JSON.stringify({ url: started.url, port: started.port, token: token ?? null, kind: first.kind, name: first.name }));
        } else {
          const what = first.kind === "timeline"
            ? `timeline "${first.name}" (${first.totalFrames} frames)`
            : `storyboard "${first.name}" (${first.shots.length} shots)`;
          console.log(`Previewing ${what} at ${started.url}`);
          if (isLoopbackHost(opts.host)) {
            console.log(`From another machine, forward the port first: ssh -N -L ${started.port}:127.0.0.1:${started.port} <this-host>`);
          } else {
            console.log("Anyone who can reach this address and has the token can view the preview.");
          }
          console.log("Stop with Ctrl+C.");
        }
      } catch (e) {
        process.exit(printCommandError(e, opts.json));
      }
    });
}
