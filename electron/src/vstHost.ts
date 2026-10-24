/**
 * VST3 instruments for the timeline, hosted by FableVstHost.
 *
 * Plug-ins are native code, so they never load into Electron: the helper from
 * the FableSynth repository (github.com/georgi/fablesynth, `juce/source/vsthost`)
 * runs them in its own process and a crashing plug-in takes down only the
 * helper, which restarts on the next request. Requests and replies are JSON
 * lines on the helper's stdin and stdout, and a render's audio comes back
 * through a temporary file.
 *
 * The renderer names plug-ins by path, so every path is checked against this
 * process's own scan before the helper loads it: a renderer cannot point the
 * helper at an arbitrary library.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { randomUUID } from "crypto";
import { promises as fs, existsSync } from "fs";
import * as os from "os";
import * as path from "path";
import { createInterface } from "readline";
import { app, BrowserWindow } from "electron";
import { z } from "zod";
import { logMessage } from "./logger";
import {
  IpcChannels,
  type VstHostEvent,
  type VstHostStatus,
  type VstOpenEditorRequest,
  type VstPluginInfo,
  type VstPluginTarget,
  type VstRenderRequest,
  type VstRenderResult,
} from "./types.d";

/** Names the helper executable may have, per platform. */
function helperFileName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "FableVstHost.exe" : "FableVstHost";
}

/**
 * Where the helper may be, in order: `NODETOOL_VST_HOST`, the app's bundled
 * resources, then `<userData>/vst-host/`.
 */
export function vstHostCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const name = helperFileName(platform);
  const candidates: string[] = [];
  const override = env.NODETOOL_VST_HOST?.trim();
  if (override) {
    candidates.push(override);
  }
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "vst-host", name));
  }
  candidates.push(path.join(app.getPath("userData"), "vst-host", name));
  return candidates;
}

export function findVstHost(candidates: string[] = vstHostCandidates()): string | null {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** How long one request may take. A scan loads every bundle on the machine. */
const TIMEOUT_MS = { scan: 180_000, render: 120_000, default: 30_000 } as const;
/** The longest render accepted, in frames at any rate (ten minutes at 192 kHz). */
const MAX_RENDER_FRAMES = 192_000 * 600;
const MAX_EVENTS = 100_000;
const INSTANCE_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

// The renderer is untrusted: every request is parsed here.
const instanceSchema = z.string().regex(INSTANCE_PATTERN, "Invalid VST instance id");
const targetSchema = z.object({ path: z.string().min(1).max(4096), uid: z.string().min(1).max(512) });
const stateSchema = z.string().max(8_000_000).nullable();
const renderRequestSchema = z.object({
  plugin: targetSchema,
  state: stateSchema,
  sampleRate: z.number().min(8000).max(384_000),
  frames: z.number().int().min(0).max(MAX_RENDER_FRAMES),
  events: z
    .array(
      z.object({
        pitch: z.number().int().min(0).max(127),
        velocity: z.number().int().min(1).max(127),
        startFrame: z.number().int().min(0),
        gateOffFrame: z.number().int().min(0),
      }),
    )
    .max(MAX_EVENTS),
});
const openEditorRequestSchema = z.object({
  instance: instanceSchema,
  plugin: targetSchema,
  state: stateSchema,
  title: z.string().max(200),
});

// What the helper writes on stdout.
const pluginInfoSchema = z.object({
  uid: z.string(),
  path: z.string(),
  name: z.string(),
  vendor: z.string().catch(""),
  version: z.string().catch(""),
  isInstrument: z.boolean().catch(false),
});
const helperEventSchema = z.object({
  event: z.enum(["state", "editorClosed"]),
  instance: z.string().optional(),
  state: z.string().optional(),
});
const helperReplySchema = z
  .object({ id: z.number(), ok: z.boolean(), error: z.string().optional() })
  .passthrough();
const scanReplySchema = z.object({ plugins: z.array(z.unknown()).catch([]) });

function parseRequest<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid VST ${what}: ${parsed.error.issues[0]?.message ?? "malformed"}`);
  }
  return parsed.data;
}

interface Pending {
  resolve: (reply: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

type Spawn = (command: string) => ChildProcessWithoutNullStreams;

export interface VstHostOptions {
  /** The helper executable, or null when none is installed. */
  locate?: () => string | null;
  spawnHelper?: Spawn;
  /** Receives the helper's unrequested events. */
  onEvent?: (event: VstHostEvent) => void;
  tmpDir?: string;
}

/** One helper process, started on first use and restarted after it exits. */
export class VstHost {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private scanned: VstPluginInfo[] | null = null;
  private scanning: Promise<VstPluginInfo[]> | null = null;
  private readonly locate: () => string | null;
  private readonly spawnHelper: Spawn;
  private readonly onEvent: (event: VstHostEvent) => void;
  private readonly tmpDir: string;

  constructor(options: VstHostOptions = {}) {
    this.locate = options.locate ?? (() => findVstHost());
    this.spawnHelper =
      options.spawnHelper ??
      ((command) => spawn(command, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }));
    this.onEvent = options.onEvent ?? (() => {});
    this.tmpDir = options.tmpDir ?? os.tmpdir();
  }

  status(): VstHostStatus {
    const found = this.locate();
    if (!found) {
      return {
        available: false,
        reason:
          "The VST host is not installed. Build FableVstHost from the FableSynth repository and set NODETOOL_VST_HOST to its path, or place it in the app's vst-host folder.",
      };
    }
    return { available: true, path: found };
  }

  /** The VST3 instruments on this machine. Cached until `rescan`. */
  async scan(rescan = false): Promise<VstPluginInfo[]> {
    if (this.scanned && !rescan) return this.scanned;
    if (!this.scanning) {
      this.scanning = this.request({ cmd: "scan" }, TIMEOUT_MS.scan)
        .then((reply) => {
          // One malformed entry drops that entry, not the whole list.
          this.scanned = scanReplySchema.parse(reply).plugins.flatMap((entry) => {
            const plugin = pluginInfoSchema.safeParse(entry);
            return plugin.success ? [plugin.data] : [];
          });
          return this.scanned;
        })
        .finally(() => {
          this.scanning = null;
        });
    }
    return this.scanning;
  }

  async render(input: VstRenderRequest): Promise<VstRenderResult> {
    const request = parseRequest(renderRequestSchema, input, "render request");
    const plugin = await this.checkPlugin(request.plugin);
    const frames = request.frames;
    const out = path.join(this.tmpDir, `nodetool-vst-${randomUUID()}.f32`);
    try {
      await this.request(
        {
          cmd: "render",
          // Renders share one instance per plug-in: each applies its own state
          // under the helper's lock, so tracks on one plug-in cannot mix.
          instance: `render:${plugin.uid}`,
          path: plugin.path,
          uid: plugin.uid,
          state: request.state ?? "",
          sampleRate: request.sampleRate,
          frames,
          events: request.events,
          out,
        },
        TIMEOUT_MS.render,
      );
      const bytes = await fs.readFile(out);
      if (bytes.byteLength !== frames * 2 * 4) {
        throw new Error(`VST render returned ${bytes.byteLength} bytes for ${frames} frames`);
      }
      // Copy into an aligned buffer: Buffer's offset into its pool need not be.
      const pcm = new Float32Array(frames * 2);
      new Uint8Array(pcm.buffer).set(bytes);
      return { frames, pcm };
    } finally {
      await fs.rm(out, { force: true });
    }
  }

  async openEditor(input: VstOpenEditorRequest): Promise<void> {
    const request = parseRequest(openEditorRequestSchema, input, "editor request");
    const plugin = await this.checkPlugin(request.plugin);
    await this.request({
      cmd: "openEditor",
      instance: request.instance,
      path: plugin.path,
      uid: plugin.uid,
      state: request.state ?? "",
      title: request.title,
    });
  }

  async closeEditor(input: string): Promise<void> {
    const instance = parseRequest(instanceSchema, input, "instance id");
    if (!this.child) return;
    await this.request({ cmd: "closeEditor", instance });
  }

  dispose(): void {
    const child = this.child;
    this.child = null;
    if (child) {
      child.stdin.end(`${JSON.stringify({ cmd: "quit" })}\n`);
      setTimeout(() => {
        if (child.exitCode === null) child.kill();
      }, 2000).unref();
    }
  }

  /** The scanned plug-in a request names. Scans first when nothing is cached. */
  private async checkPlugin(target: VstPluginTarget): Promise<VstPluginInfo> {
    const match = (list: VstPluginInfo[]) =>
      list.find((p) => p.path === target.path && p.uid === target.uid);
    const found = match(await this.scan()) ?? match(await this.scan(true));
    if (!found) {
      throw new Error(`The VST instrument at ${target.path} is not installed on this computer`);
    }
    return found;
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const command = this.locate();
    if (!command) {
      throw new Error(this.status().reason);
    }
    logMessage(`Starting VST host ${command}`);
    const child = this.spawnHelper(command);
    this.child = child;
    createInterface({ input: child.stdout }).on("line", (line) => this.onLine(line));
    // A write after the helper died fails here; the exit handler rejects the request.
    child.stdin.on("error", (error) => logMessage(`VST host stdin: ${error.message}`, "warn"));
    child.stderr.on("data", (chunk: Buffer) => {
      logMessage(`[vst-host] ${chunk.toString().trimEnd()}`, "warn");
    });
    const finish = (reason: string) => {
      if (this.child === child) this.child = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`The VST host stopped (${reason})`));
        this.pending.delete(id);
      }
      this.onEvent({ event: "exited" });
    };
    child.on("error", (error) => finish(error.message));
    child.on("exit", (code, signal) => {
      logMessage(`VST host exited (code ${code}, signal ${signal})`, code === 0 ? "info" : "warn");
      finish(signal ?? `code ${code}`);
    });
    return child;
  }

  private onLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      logMessage(`[vst-host] ${line}`);
      return;
    }
    const event = helperEventSchema.safeParse(message);
    if (event.success) {
      this.onEvent(event.data);
      return;
    }
    const reply = helperReplySchema.safeParse(message);
    if (!reply.success) return;
    const pending = this.pending.get(reply.data.id);
    if (!pending) return;
    this.pending.delete(reply.data.id);
    clearTimeout(pending.timer);
    if (reply.data.ok) {
      pending.resolve(reply.data);
    } else {
      pending.reject(new Error(reply.data.error ?? "VST host request failed"));
    }
  }

  private request(body: Record<string, unknown>, timeoutMs: number = TIMEOUT_MS.default): Promise<Record<string, unknown>> {
    const child = this.ensureChild();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`The VST host did not answer "${String(body.cmd)}" in time`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
    });
  }
}

let shared: VstHost | null = null;

/** The app's one VST host. Its events go to every window. */
export function getVstHost(): VstHost {
  shared ??= new VstHost({
    onEvent: (event) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send(IpcChannels.VST_EVENT, event);
      }
    },
  });
  return shared;
}

export function disposeVstHost(): void {
  shared?.dispose();
  shared = null;
}
