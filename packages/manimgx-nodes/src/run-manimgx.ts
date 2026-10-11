/**
 * Run the `manimgx` command line on one scene.
 *
 * A scene is Python source that runs with the server's permissions, so the
 * run is refused under the cloud profile (the same switch that keeps the
 * `nodetool.manimgx` namespace out of the cloud catalog). Elsewhere the
 * machine belongs to its user, as with the Code node and Blender.
 *
 * Each run gets its own directory under `context.workspace.scratchDir()`:
 * the scene is written as `scene.py`, the node's wired values as
 * `inputs.json` beside a `nodetool_inputs` module that loads them, and media
 * inputs as files under `inputs/`. The argv is fixed here and every value
 * that reaches it is validated, so no input can become a flag. The child gets
 * an allowlisted environment, never the server's secrets. Outputs are read
 * only from the names this module chose, after an `lstat` proves each is a
 * regular file.
 */

import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { isRecord } from "@nodetool-ai/node-sdk";
import {
  CLOUD_PROFILE_ENV,
  NODE_ENV_VAR,
  isCloudProfileActive
} from "@nodetool-ai/protocol";
import {
  loadMediaRefBytes,
  runHostBinary,
  type MediaRefValue,
  type ProcessingContext
} from "@nodetool-ai/runtime";

import { resolveManimgxBinary } from "./manimgx-binary.js";

/** The x264 presets ManimGX accepts, fastest first. */
export const MANIMGX_PRESETS = [
  "ultrafast",
  "superfast",
  "veryfast",
  "faster",
  "fast",
  "medium",
  "slow",
  "slower",
  "veryslow"
] as const;
export type ManimgxPreset = (typeof MANIMGX_PRESETS)[number];

export interface ManimgxRenderSettings {
  width: number;
  height: number;
  fps: number;
  preset: ManimgxPreset;
  crf: number;
}

export interface ManimgxScene {
  /** Python source: `import manimgx as m` and one or more `m.Scene` subclasses. */
  code: string;
  /** The scene class to run; empty runs the file's only scene. */
  sceneName?: string;
  /** Values exposed to the scene as `from nodetool_inputs import inputs`. */
  inputs?: Record<string, unknown>;
}

export type ManimgxRun =
  | { command: "render"; settings: ManimgxRenderSettings }
  | { command: "inspect"; times?: string };

export interface ManimgxRunOptions {
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ManimgxResult {
  /** Whether the scene ran. False carries the scene's error in `report`. */
  ok: boolean;
  /** Layout problems `inspect` found (`ok` stays true: the scene ran). */
  problems: boolean;
  /** What ManimGX reported: timeline and layout checks, or the scene's error. */
  report: string;
  /** Storyboard sheets, in order: the frame at each play's end, problems outlined. */
  storyboards: Uint8Array[];
  /** The MP4, for `render`. */
  video: Uint8Array | null;
  /** SubRip subtitles, when the scene speaks or has subcaptions. */
  subtitles: string;
  /** Seconds of film, parsed from ManimGX's summary line; 0 when absent. */
  duration: number;
}

export class ManimgxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManimgxError";
  }
}

/** What the run answers where this deployment offers none. */
export const MANIMGX_DISABLED_ERROR =
  "ManimGX scenes are Python programs, so they run only where the machine " +
  "belongs to its user: the desktop app, a local server, or a self-hosted install.";

/** Whether this deployment may run ManimGX scenes. */
export function isManimgxEnabled(): boolean {
  return !isCloudProfileActive(
    process.env[CLOUD_PROFILE_ENV],
    process.env[NODE_ENV_VAR]
  );
}

/** Env keys the child inherits; prefixes cover the GPU and Vulkan loader. */
const ALLOWED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "LOCALAPPDATA",
  "APPDATA",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "SYSTEMROOT",
  "XDG_CACHE_HOME",
  "XDG_RUNTIME_DIR",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "CUDA_VISIBLE_DEVICES"
] as const;
const ALLOWED_ENV_PREFIXES = ["VK_", "WGPU_", "MESA_", "LIBGL_", "LP_"] as const;

export function childEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (
      (ALLOWED_ENV_KEYS as readonly string[]).includes(key) ||
      ALLOWED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      env[key] = value;
    }
  }
  env["PYTHONDONTWRITEBYTECODE"] = "1";
  env["PYTHONIOENCODING"] = "utf-8";
  return env;
}

const SCENE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TIMES = /^\s*(?:\d+(?:\.\d+)?|end)(?:\s*,\s*(?:\d+(?:\.\d+)?|end))*\s*$/;

/** The argv after the executable. Exported for tests: no value becomes a flag. */
export function manimgxArgs(scene: ManimgxScene, run: ManimgxRun): string[] {
  const name = scene.sceneName?.trim() ?? "";
  if (name !== "" && !SCENE_NAME.test(name)) {
    throw new ManimgxError(
      `scene name ${JSON.stringify(name)} is not a Python class name`
    );
  }
  const args = [run.command, SCENE_FILE];
  if (name !== "") args.push(name);
  if (run.command === "render") {
    const { width, height, fps, preset, crf } = run.settings;
    if (!(MANIMGX_PRESETS as readonly string[]).includes(preset)) {
      throw new ManimgxError(`unknown x264 preset ${JSON.stringify(preset)}`);
    }
    args.push(
      "-r",
      `${evenPixels(width)}x${evenPixels(height)}`,
      "--fps",
      String(clampInt(fps, 1, 120)),
      "--preset",
      preset,
      "--crf",
      String(Math.min(51, Math.max(0, Number.isFinite(crf) ? crf : 23))),
      "-o",
      VIDEO_FILE
    );
  } else {
    args.push("-o", STORYBOARD_FILE);
    const times = run.times?.trim() ?? "";
    if (times !== "") {
      if (!TIMES.test(times)) {
        throw new ManimgxError(
          `times ${JSON.stringify(times)} must be seconds or 'end', separated by commas`
        );
      }
      args.push("-t", times.replace(/\s+/g, ""));
    }
  }
  return args;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

/** H.264 in yuv420p needs even dimensions. */
function evenPixels(value: number): number {
  const n = clampInt(value, 16, 7680);
  return n % 2 === 0 ? n : n + 1;
}

const SCENE_FILE = "scene.py";
const VIDEO_FILE = "scene.mp4";
const STORYBOARD_FILE = "storyboard.png";
const INPUTS_FILE = "inputs.json";
const INPUTS_MODULE = "nodetool_inputs.py";
const INPUTS_DIR = "inputs";

const INPUTS_MODULE_SOURCE = `"""Values wired into the NodeTool node. Media inputs arrive as file paths."""

import json
from pathlib import Path

inputs = json.loads(Path(__file__).with_name("${INPUTS_FILE}").read_text(encoding="utf-8"))
`;

const MEDIA_TYPES: Record<string, string> = {
  image: ".png",
  audio: ".wav",
  video: ".mp4",
  model3d: ".glb",
  document: ".bin"
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
  "audio/flac": ".flac",
  "video/mp4": ".mp4",
  "video/webm": ".webm"
};

function isMediaRef(value: unknown): value is MediaRefValue & { type: string } {
  return (
    isRecord(value) &&
    typeof value["type"] === "string" &&
    value["type"] in MEDIA_TYPES &&
    ("data" in value || "uri" in value || "asset_id" in value)
  );
}

function extensionOf(ref: Record<string, unknown>): string {
  const mime = ref["content_type"] ?? ref["mime_type"] ?? ref["mimeType"];
  if (typeof mime === "string" && mime in EXTENSION_BY_MIME) {
    return EXTENSION_BY_MIME[mime];
  }
  const uri = ref["uri"];
  if (typeof uri === "string") {
    const ext = path.extname(uri.split(/[?#]/, 1)[0] ?? "").toLowerCase();
    if (/^\.[a-z0-9]{1,5}$/.test(ext)) return ext;
  }
  return MEDIA_TYPES[String(ref["type"])] ?? ".bin";
}

/**
 * Write each media input as a file and replace it with that file's absolute
 * path; everything else passes through as JSON. Lists and dicts recurse.
 */
async function stageInputs(
  dir: string,
  inputs: Record<string, unknown>,
  context: ProcessingContext
): Promise<Record<string, unknown>> {
  let count = 0;
  const stage = async (value: unknown, label: string): Promise<unknown> => {
    if (isMediaRef(value)) {
      const bytes = await loadMediaRefBytes(value, context);
      if (!bytes || bytes.length === 0) {
        throw new ManimgxError(`input ${label} has no media bytes`);
      }
      count += 1;
      const safe = label.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 64);
      const file = path.join(dir, INPUTS_DIR, `${count}_${safe}${extensionOf(value)}`);
      await writeFile(file, bytes);
      return file;
    }
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      for (const [i, item] of value.entries()) out.push(await stage(item, `${label}_${i}`));
      return out;
    }
    if (isRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value)) {
        out[key] = await stage(item, `${label}_${key}`);
      }
      return out;
    }
    if (value instanceof Uint8Array) return null;
    return value;
  };
  await mkdir(path.join(dir, INPUTS_DIR), { recursive: true });
  const staged: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(inputs)) {
    staged[name] = await stage(value, name);
  }
  return staged;
}

/** Read `name` from `dir` only when it is a regular file, never a link. */
async function readOwnFile(dir: string, name: string): Promise<Uint8Array | null> {
  const file = path.join(dir, name);
  try {
    const info = await lstat(file);
    if (!info.isFile()) return null;
  } catch {
    return null;
  }
  return new Uint8Array(await readFile(file));
}

/** The storyboard sheets `stem.png`, `stem-2.png`, … in page order. */
async function readStoryboards(dir: string, file: string): Promise<Uint8Array[]> {
  const stem = file.replace(/\.png$/, "");
  const pattern = new RegExp(`^${stem.replace(/\./g, "\\.")}(?:-(\\d+))?\\.png$`);
  const pages = (await readdir(dir))
    .map((name) => ({ name, match: pattern.exec(name) }))
    .filter((entry) => entry.match !== null)
    .map((entry) => ({ name: entry.name, page: Number(entry.match?.[1] ?? 1) }))
    .sort((a, b) => a.page - b.page);
  const sheets: Uint8Array[] = [];
  for (const page of pages) {
    const bytes = await readOwnFile(dir, page.name);
    if (bytes) sheets.push(bytes);
  }
  return sheets;
}

/** Drop the lines naming output files: they are scratch paths, gone after the run. */
function reportOf(stdout: string): string {
  return stdout
    .split("\n")
    .filter((line) => !/^(storyboard|subtitles): /.test(line))
    .join("\n")
    .trim();
}

function durationOf(stdout: string): number {
  const match = /(?:^|\s)(\d+(?:\.\d+)?) s[,\s]/m.exec(stdout);
  return match ? Number(match[1]) : 0;
}

const ERROR_TAIL_CHARS = 6000;

function errorText(stdout: string, stderr: string): string {
  const text = `${stderr.trim()}\n${stdout.trim()}`.trim();
  return text.length > ERROR_TAIL_CHARS ? `…${text.slice(-ERROR_TAIL_CHARS)}` : text;
}

/**
 * Run one scene through `manimgx render` or `manimgx inspect`.
 *
 * A scene that fails resolves with `ok: false` and the traceback (ManimGX's,
 * trimmed to the scene's own lines, with a "did you mean" hint) in `report`,
 * so an author can fix it. A failure of the run itself throws.
 */
export async function runManimgx(
  context: ProcessingContext | undefined,
  scene: ManimgxScene,
  run: ManimgxRun,
  options: ManimgxRunOptions
): Promise<ManimgxResult> {
  if (!isManimgxEnabled()) throw new ManimgxError(MANIMGX_DISABLED_ERROR);
  if (scene.code.trim() === "") {
    throw new ManimgxError("the scene code is empty: write a Scene subclass with a construct method");
  }
  const args = manimgxArgs(scene, run);
  const workspace = context?.workspace;
  if (!context || !workspace) {
    throw new ManimgxError("a ManimGX run needs a processing context with a workspace");
  }
  // A stored path is executable configuration; only a user-owned machine reads it.
  const configuredPath = await context.getSetting("MANIMGX_PATH");
  const binary = await resolveManimgxBinary({ configuredPath });

  const parent = await workspace.scratchDir();
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(path.join(parent, "manimgx-"));
  try {
    const inputs = await stageInputs(dir, scene.inputs ?? {}, context);
    await writeFile(path.join(dir, INPUTS_FILE), JSON.stringify(inputs), "utf8");
    await writeFile(path.join(dir, INPUTS_MODULE), INPUTS_MODULE_SOURCE, "utf8");
    await writeFile(path.join(dir, SCENE_FILE), scene.code, "utf8");

    // runHostBinary traces the run as `subprocess.run`, executable name included.
    const result = await runHostBinary(binary.path, args, {
      cwd: dir,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
      env: childEnv(),
      concurrencyClass: "render",
      artifactPath: run.command === "render" ? VIDEO_FILE : undefined
    });
    if (result.exitCode === 124) {
      // runHostBinary's code for both a timeout and a video past the size cap.
      throw new ManimgxError(
        /passed the \d+-byte output limit/.test(result.stderr)
          ? "the video passed the output size limit. Lower the resolution, frame rate or length, or raise the CRF."
          : `the scene ran past its ${Math.round(options.timeoutMs / 1000)} s timeout. ` +
              "Shorten it, lower the resolution or frame rate, or raise the timeout."
      );
    }
    const problems =
      run.command === "inspect" &&
      result.exitCode === 1 &&
      /^layout: \d+ problems?/m.test(result.stdout);
    if (result.exitCode !== 0 && !problems) {
      return {
        ok: false,
        problems: false,
        report: errorText(result.stdout, result.stderr),
        storyboards: [],
        video: null,
        subtitles: "",
        duration: 0
      };
    }
    const storyboardFile =
      run.command === "render" ? VIDEO_FILE.replace(/\.mp4$/, ".storyboard.png") : STORYBOARD_FILE;
    const video = run.command === "render" ? await readOwnFile(dir, VIDEO_FILE) : null;
    if (run.command === "render" && (!video || video.length === 0)) {
      throw new ManimgxError(`manimgx exited cleanly but wrote no video. ${errorText(result.stdout, result.stderr)}`);
    }
    const srt = await readOwnFile(dir, VIDEO_FILE.replace(/\.mp4$/, ".srt"));
    return {
      ok: true,
      problems,
      report: reportOf(result.stdout),
      storyboards: await readStoryboards(dir, storyboardFile),
      video,
      subtitles: srt ? Buffer.from(srt).toString("utf8") : "",
      duration: durationOf(result.stdout)
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
