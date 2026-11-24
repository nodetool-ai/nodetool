/**
 * Headless Node.js adapter from `TimelineOpPluginHost` to the out-of-process
 * `NodeToolVstHost` helper executable. Speaks the same JSON-line protocol on
 * stdin/stdout as `electron/src/vstHost.ts` and `native/vst-host/`.
 *
 * Every plugin path/uid is verified against this process's own `scan` results
 * before any preset or parameter command reaches the helper.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import type {
  PluginHostGetParametersResult,
  PluginHostListPresetsResult,
  PluginHostParameterChange,
  PluginHostParameterInfo,
  PluginHostPluginInfo,
  PluginHostPresetInfo,
  PluginHostSelectPresetResult,
  PluginHostSetParametersResult,
  PluginHostStatus,
  PluginHostTarget,
  TimelineOpPluginHost
} from "@nodetool-ai/timeline/ops";

const TIMEOUT_MS = { scan: 180_000, default: 30_000 } as const;

function helperBinaryName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "NodeToolVstHost.exe" : "NodeToolVstHost";
}

export function nodeVstHostCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd()
): string[] {
  const name = helperBinaryName(platform);
  const candidates: string[] = [];
  const override = env.NODETOOL_VST_HOST?.trim();
  if (override) {
    candidates.push(override);
  }
  candidates.push(path.join(cwd, "electron", "vst-host", name));
  candidates.push(path.join(cwd, "vst-host", name));
  return candidates;
}

export function findNodeVstHost(
  candidates: readonly string[] = nodeVstHostCandidates()
): string | null {
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const pluginInfoSchema = z.object({
  uid: z.string().min(1),
  path: z.string().min(1),
  name: z.string(),
  vendor: z.string().catch(""),
  version: z.string().catch(""),
  format: z.enum(["vst3", "au"]).optional(),
  isInstrument: z.boolean().catch(false)
});

const presetInfoSchema = z.object({
  index: z.number().int().min(0),
  name: z.string()
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
  isAutomatable: z.boolean().optional()
});

const helperReplySchema = z
  .object({
    id: z.number(),
    ok: z.boolean(),
    error: z.string().optional()
  })
  .passthrough();

interface PendingRequest {
  resolve: (reply: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export interface NodePluginHostOptions {
  locate?: () => string | null;
  spawnHelper?: (command: string) => ChildProcessWithoutNullStreams;
}

export interface NodePluginHost extends TimelineOpPluginHost {
  dispose(): void;
}

export function createNodePluginHost(
  options: NodePluginHostOptions = {}
): NodePluginHost {
  const locate = options.locate ?? (() => findNodeVstHost());
  const spawnHelper =
    options.spawnHelper ??
    ((command: string) =>
      spawn(command, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true }));

  let child: ChildProcessWithoutNullStreams | null = null;
  let nextId = 1;
  const pending = new Map<number, PendingRequest>();
  let scanned: PluginHostPluginInfo[] | null = null;
  let scanning: Promise<PluginHostPluginInfo[]> | null = null;

  function status(): PluginHostStatus {
    const found = locate();
    if (!found) {
      return {
        available: false,
        reason:
          "The VST/AU plugin host is not installed. Run `npm run build:vst-host` in electron/, or set NODETOOL_VST_HOST to the NodeToolVstHost executable."
      };
    }
    return { available: true, path: found };
  }

  function onLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    const reply = helperReplySchema.safeParse(parsed);
    if (!reply.success) return;
    const entry = pending.get(reply.data.id);
    if (!entry) return;
    pending.delete(reply.data.id);
    clearTimeout(entry.timer);
    if (reply.data.ok) {
      entry.resolve(reply.data);
    } else {
      entry.reject(new Error(reply.data.error ?? "VST host request failed"));
    }
  }

  function ensureChild(): ChildProcessWithoutNullStreams {
    if (child) return child;
    const command = locate();
    if (!command) {
      throw new Error(status().reason ?? "VST host is not installed.");
    }
    const proc = spawnHelper(command);
    child = proc;
    createInterface({ input: proc.stdout }).on("line", onLine);
    proc.stdin.on("error", () => {});
    const finish = (reason: string) => {
      if (child === proc) child = null;
      for (const [id, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error(`The VST host stopped (${reason})`));
        pending.delete(id);
      }
    };
    proc.on("error", (err) => finish(err.message));
    proc.on("exit", (code, signal) => finish(signal ?? `code ${code}`));
    return proc;
  }

  function request(
    body: Record<string, unknown>,
    timeoutMs: number = TIMEOUT_MS.default
  ): Promise<Record<string, unknown>> {
    const proc = ensureChild();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`The VST host did not answer "${String(body.cmd)}" in time`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      proc.stdin.write(`${JSON.stringify({ ...body, id })}\n`);
    });
  }

  async function scan(
    scanOptions?: { rescan?: boolean; includeEffects?: boolean }
  ): Promise<PluginHostPluginInfo[]> {
    const rescan = scanOptions?.rescan === true;
    const includeEffects = scanOptions?.includeEffects !== false;
    if (!scanned || rescan) {
      if (!scanning) {
        scanning = request(
          { cmd: "scan", includeEffects: true },
          TIMEOUT_MS.scan
        )
          .then((reply) => {
            const rawList = Array.isArray(reply.plugins) ? reply.plugins : [];
            scanned = rawList.flatMap((entry) => {
              const p = pluginInfoSchema.safeParse(entry);
              return p.success ? [p.data] : [];
            });
            return scanned;
          })
          .finally(() => {
            scanning = null;
          });
      }
      await scanning;
    }
    const all = scanned ?? [];
    return includeEffects ? all : all.filter((p) => p.isInstrument);
  }

  async function checkPlugin(target: PluginHostTarget): Promise<PluginHostPluginInfo> {
    const match = (list: PluginHostPluginInfo[]) =>
      list.find((p) => p.path === target.path && p.uid === target.uid);
    const found =
      match(await scan({ rescan: false, includeEffects: true })) ??
      match(await scan({ rescan: true, includeEffects: true }));
    if (!found) {
      throw new Error(
        `The plugin at ${target.path} (${target.uid}) is not installed on this computer`
      );
    }
    return found;
  }

  function parseParameters(raw: unknown): PluginHostParameterInfo[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      const parsed = parameterInfoSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  }

  function parsePresets(raw: unknown): PluginHostPresetInfo[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry) => {
      const parsed = presetInfoSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  }

  return {
    status,
    scan,

    async listPresets(req): Promise<PluginHostListPresetsResult> {
      const plugin = await checkPlugin(req.plugin);
      const reply = await request({
        cmd: "listPresets",
        instance: req.instance,
        path: plugin.path,
        uid: plugin.uid,
        state: req.state ?? ""
      });
      return {
        currentPresetIndex:
          typeof reply.currentPresetIndex === "number"
            ? reply.currentPresetIndex
            : 0,
        presets: parsePresets(reply.presets)
      };
    },

    async selectPreset(req): Promise<PluginHostSelectPresetResult> {
      const plugin = await checkPlugin(req.plugin);
      const reply = await request({
        cmd: "selectPreset",
        instance: req.instance,
        path: plugin.path,
        uid: plugin.uid,
        state: req.state ?? "",
        ...(req.presetIndex !== undefined ? { presetIndex: req.presetIndex } : {}),
        ...(req.presetName !== undefined ? { presetName: req.presetName } : {})
      });
      const preset = presetInfoSchema.parse(reply.preset);
      const state =
        typeof reply.state === "string" && reply.state.length > 0
          ? reply.state
          : null;
      return { preset, state };
    },

    async getParameters(req): Promise<PluginHostGetParametersResult> {
      const plugin = await checkPlugin(req.plugin);
      const reply = await request({
        cmd: "getParameters",
        instance: req.instance,
        path: plugin.path,
        uid: plugin.uid,
        state: req.state ?? ""
      });
      return { parameters: parseParameters(reply.parameters) };
    },

    async setParameters(req: {
      instance: string;
      plugin: PluginHostTarget;
      state: string | null;
      changes: PluginHostParameterChange[];
    }): Promise<PluginHostSetParametersResult> {
      const plugin = await checkPlugin(req.plugin);
      const reply = await request({
        cmd: "setParameters",
        instance: req.instance,
        path: plugin.path,
        uid: plugin.uid,
        state: req.state ?? "",
        changes: req.changes
      });
      const state =
        typeof reply.state === "string" && reply.state.length > 0
          ? reply.state
          : null;
      return {
        parameters: parseParameters(reply.parameters),
        state
      };
    },

    dispose(): void {
      const proc = child;
      child = null;
      if (proc) {
        proc.stdin.end(`${JSON.stringify({ cmd: "quit" })}\n`);
        setTimeout(() => {
          if (proc.exitCode === null) proc.kill();
        }, 2000).unref();
      }
    }
  };
}

let sharedNodePluginHost: NodePluginHost | null = null;

export function getSharedNodePluginHost(): NodePluginHost {
  sharedNodePluginHost ??= createNodePluginHost();
  return sharedNodePluginHost;
}

export function disposeSharedNodePluginHost(): void {
  sharedNodePluginHost?.dispose();
  sharedNodePluginHost = null;
}
