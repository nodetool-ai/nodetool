/**
 * VST3 instruments for the timeline, hosted by NodeToolVstHost.
 *
 * Plug-ins are native code, so they never load into Electron: the helper
 * (`native/vst-host`, staged by `scripts/build-vst-host.mjs`) runs them in its own process and a crashing plug-in takes down only the
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
import { isCloudWindowId } from "./cloudWindow";
import { logMessage } from "./logger";
import { isTrustedAppOrigin } from "./windowSecurity";
import {
  IpcChannels,
  type VstGetParametersRequest,
  type VstGetParametersResult,
  type VstHostEvent,
  type VstHostStatus,
  type VstListPresetsRequest,
  type VstListPresetsResult,
  type VstOpenEditorRequest,
  type VstPluginInfo,
  type VstPluginTarget,
  type VstRenderRequest,
  type VstRenderResult,
  type VstSelectPresetRequest,
  type VstSelectPresetResult,
  type VstSetParametersRequest,
  type VstSetParametersResult,
} from "./types.d";

/** Names the helper executable may have, per platform. */
function helperFileName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "NodeToolVstHost.exe" : "NodeToolVstHost";
}

/**
 * Where the helper may be, in order: `NODETOOL_VST_HOST`, the app's bundled
 * resources (`electron/vst-host/` when unpackaged), then `<userData>/vst-host/`.
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
  candidates.push(
    app.isPackaged
      ? path.join(process.resourcesPath, "vst-host", name)
      : path.join(app.getAppPath(), "vst-host", name),
  );
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
const MAX_INT32 = 2_147_483_647;
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
const listPresetsRequestSchema = z.object({
  instance: instanceSchema,
  plugin: targetSchema,
  state: stateSchema,
});
const selectPresetRequestSchema = z
  .object({
    instance: instanceSchema,
    plugin: targetSchema,
    state: stateSchema,
    presetIndex: z.number().int().min(0).max(MAX_INT32).optional(),
    presetName: z.string().min(1).max(256).optional(),
  })
  .refine((v) => v.presetIndex !== undefined || v.presetName !== undefined, {
    message: "presetIndex or presetName is required",
  });
const getParametersRequestSchema = z.object({
  instance: instanceSchema,
  plugin: targetSchema,
  state: stateSchema,
});
const parameterChangeSchema = z
  .object({
    id: z.string().min(1).max(256).optional(),
    index: z.number().int().min(0).max(MAX_INT32).optional(),
    value: z.number().finite().min(0).max(1).optional(),
    displayValue: z.string().min(1).max(256).optional(),
  })
  .refine((v) => v.id !== undefined || v.index !== undefined, {
    message: "parameter change requires id or index",
  })
  .refine((v) => (v.value !== undefined) !== (v.displayValue !== undefined), {
    message: "parameter change requires exactly one of value or displayValue",
  });
const setParametersRequestSchema = z.object({
  instance: instanceSchema,
  plugin: targetSchema,
  state: stateSchema,
  changes: z.array(parameterChangeSchema).min(1).max(128),
});

// What the helper writes on stdout.
const pluginInfoSchema = z.object({
  uid: z.string(),
  path: z.string(),
  name: z.string(),
  vendor: z.string().catch(""),
  version: z.string().catch(""),
  format: z.enum(["vst3", "au"]).optional(),
  isInstrument: z.boolean().catch(false),
});
const presetInfoSchema = z.object({
  index: z.number().int().min(0),
  name: z.string(),
});
const parameterInfoSchema = z.object({
  id: z.string(),
  index: z.number().int().min(0),
  name: z.string(),
  label: z.string().optional(),
  value: z.number(),
  displayValue: z.string(),
  defaultValue: z.number().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  numSteps: z.number().int().optional(),
  isDiscrete: z.boolean().optional(),
  isBoolean: z.boolean().optional(),
  isAutomatable: z.boolean().optional(),
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
          "The VST host is not installed. Run `npm run build:vst-host` in electron/, or set NODETOOL_VST_HOST to the NodeToolVstHost executable.",
      };
    }
    return { available: true, path: found };
  }

  /** The VST3/AU plug-ins on this machine. Cached until `rescan`. */
  async scan(rescan = false, includeEffects = false): Promise<VstPluginInfo[]> {
    if (!this.scanned || rescan) {
      if (!this.scanning) {
        this.scanning = this.request({ cmd: "scan", includeEffects: true }, TIMEOUT_MS.scan)
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
      await this.scanning;
    }
    const all = this.scanned ?? [];
    return includeEffects ? all : all.filter((plugin) => plugin.isInstrument);
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

  async listPresets(input: VstListPresetsRequest): Promise<VstListPresetsResult> {
    const request = parseRequest(listPresetsRequestSchema, input, "listPresets request");
    const plugin = await this.checkPlugin(request.plugin);
    const reply = await this.request({
      cmd: "listPresets",
      instance: request.instance,
      path: plugin.path,
      uid: plugin.uid,
      state: request.state ?? "",
    });
    const presets = Array.isArray(reply.presets)
      ? reply.presets.flatMap((entry) => {
          const parsed = presetInfoSchema.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    return {
      currentPresetIndex: typeof reply.currentPresetIndex === "number" ? reply.currentPresetIndex : 0,
      presets,
    };
  }

  async selectPreset(input: VstSelectPresetRequest): Promise<VstSelectPresetResult> {
    const request = parseRequest(selectPresetRequestSchema, input, "selectPreset request");
    const plugin = await this.checkPlugin(request.plugin);
    const reply = await this.request({
      cmd: "selectPreset",
      instance: request.instance,
      path: plugin.path,
      uid: plugin.uid,
      state: request.state ?? "",
      ...(request.presetIndex !== undefined ? { presetIndex: request.presetIndex } : {}),
      ...(request.presetName !== undefined ? { presetName: request.presetName } : {}),
    });
    const preset = this.resolveSelectedPreset(reply, request);
    const state = typeof reply.state === "string" && reply.state.length > 0 ? reply.state : request.state;
    return { preset, state };
  }

  private resolveSelectedPreset(
    reply: Record<string, unknown>,
    request: { presetIndex?: number; presetName?: string },
  ): { index: number; name: string } {
    const direct = presetInfoSchema.safeParse(reply.preset);
    if (direct.success) return direct.data;
    const presets = Array.isArray(reply.presets)
      ? reply.presets.flatMap((entry) => {
          const parsed = presetInfoSchema.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    if (request.presetIndex !== undefined) {
      const byIndex = presets.find((p) => p.index === request.presetIndex);
      if (byIndex) return byIndex;
      return { index: request.presetIndex, name: request.presetName ?? "" };
    }
    if (request.presetName !== undefined) {
      const lower = request.presetName.toLowerCase();
      const byName = presets.find((p) => p.name.toLowerCase() === lower);
      if (byName) return byName;
      const currentIdx =
        typeof reply.currentPresetIndex === "number" &&
        Number.isInteger(reply.currentPresetIndex) &&
        reply.currentPresetIndex >= 0
          ? reply.currentPresetIndex
          : 0;
      return { index: currentIdx, name: request.presetName };
    }
    return { index: 0, name: "" };
  }

  async getParameters(input: VstGetParametersRequest): Promise<VstGetParametersResult> {
    const request = parseRequest(getParametersRequestSchema, input, "getParameters request");
    const plugin = await this.checkPlugin(request.plugin);
    const reply = await this.request({
      cmd: "getParameters",
      instance: request.instance,
      path: plugin.path,
      uid: plugin.uid,
      state: request.state ?? "",
    });
    const parameters = Array.isArray(reply.parameters)
      ? reply.parameters.flatMap((entry) => {
          const parsed = parameterInfoSchema.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    return { parameters };
  }

  async setParameters(input: VstSetParametersRequest): Promise<VstSetParametersResult> {
    const request = parseRequest(setParametersRequestSchema, input, "setParameters request");
    const plugin = await this.checkPlugin(request.plugin);
    const reply = await this.request({
      cmd: "setParameters",
      instance: request.instance,
      path: plugin.path,
      uid: plugin.uid,
      state: request.state ?? "",
      changes: request.changes,
    });
    const parameters = Array.isArray(reply.parameters)
      ? reply.parameters.flatMap((entry) => {
          const parsed = parameterInfoSchema.safeParse(entry);
          return parsed.success ? [parsed.data] : [];
        })
      : [];
    const state = typeof reply.state === "string" && reply.state.length > 0 ? reply.state : request.state;
    return { parameters, state };
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
    const found = match(await this.scan(false, true)) ?? match(await this.scan(true, true));
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
let excludedVstEventWindow: ((webContentsId: number) => boolean) | null = null;

/** Registers an additional exclusion predicate (e.g. cloud window) for VST_EVENT broadcasts. */
export function setVstEventWindowFilter(filter: ((webContentsId: number) => boolean) | null): void {
  excludedVstEventWindow = filter;
}

/** The app's one VST host. Its events go only to trusted local windows. */
export function getVstHost(): VstHost {
  shared ??= new VstHost({
    onEvent: (event) => {
      for (const w of BrowserWindow.getAllWindows()) {
        if (w.isDestroyed()) continue;
        if (isCloudWindowId(w.webContents.id) || excludedVstEventWindow?.(w.webContents.id)) continue;
        const url = typeof w.webContents.getURL === "function" ? w.webContents.getURL() : "";
        if (url && !isTrustedAppOrigin(url)) continue;
        w.webContents.send(IpcChannels.VST_EVENT, event);
      }
    },
  });
  return shared;
}

export function disposeVstHost(): void {
  shared?.dispose();
  shared = null;
}
