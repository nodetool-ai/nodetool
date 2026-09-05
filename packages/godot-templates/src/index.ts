/**
 * @nodetool-ai/godot-templates
 *
 * The shipped Godot 4.3 project templates and a headless runner around the
 * Godot binary: import a project, syntax-check its scripts, run its smoke test.
 */

import { accessSync, constants, readdirSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gameAssetManifest, type GameAssetManifest } from "@nodetool-ai/protocol";

export interface TemplateInfo {
  id: string;
  /** Absolute path of the template's project directory. */
  dir: string;
  manifest: GameAssetManifest;
}

export interface GodotRunOptions {
  projectDir: string;
  args: string[];
  timeoutMs?: number;
}

export interface GodotRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export class GodotMissingError extends Error {
  constructor() {
    super("No Godot binary found: set GODOT_BIN or put godot, godot4 or Godot on PATH");
    this.name = "GodotMissingError";
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;
const GODOT_NAMES = ["godot", "godot4", "Godot"];

/** `templates/` next to `src/` in the checkout and next to `dist/` when built. */
export const TEMPLATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "templates");

export function listTemplates(): TemplateInfo[] {
  return readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((id) => {
      const dir = join(TEMPLATES_DIR, id);
      const manifest = gameAssetManifest.parse(
        JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"))
      );
      return { id, dir, manifest };
    });
}

export function getTemplate(id: string): TemplateInfo {
  const template = listTemplates().find((t) => t.id === id);
  if (!template) {
    throw new Error(`Unknown Godot template ${id}`);
  }
  return template;
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    // not there or not runnable: keep looking
    return false;
  }
}

/** `GODOT_BIN`, then `godot` / `godot4` / `Godot` on PATH. Null when none runs. */
export function findGodot(): string | null {
  const fromEnv = process.env.GODOT_BIN;
  if (fromEnv && isExecutable(fromEnv)) {
    return fromEnv;
  }
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const name of GODOT_NAMES) {
      const candidate = join(dir, name);
      if (isExecutable(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

export function runGodotHeadless(opts: GodotRunOptions): Promise<GodotRunResult> {
  const bin = findGodot();
  if (!bin) {
    return Promise.reject(new GodotMissingError());
  }
  const args = ["--headless", "--path", opts.projectDir, ...opts.args];
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { cwd: opts.projectDir, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        stderr += `\ngodot killed after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`;
      }
      resolvePromise({ code: timedOut ? null : code, stdout, stderr });
    });
  });
}

/** `godot --headless --path <dir> --import --quit`: fills `.godot/imported`. */
export function importProject(projectDir: string): Promise<GodotRunResult> {
  return runGodotHeadless({ projectDir, args: ["--import", "--quit"] });
}

/** Every `.gd` under the project, as `res://` paths, sorted. */
export function listScripts(projectDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".gd")) {
        found.push(`res://${relative(projectDir, full).split(sep).join("/")}`);
      }
    }
  };
  walk(projectDir);
  return found.sort();
}

export interface ScriptCheckResult {
  ok: boolean;
  /** One entry per script, in the order checked. */
  results: Array<{ script: string } & GodotRunResult>;
}

/** `godot --headless --path <dir> --check-only -s <script>` for each `.gd`. */
export async function checkScripts(projectDir: string): Promise<ScriptCheckResult> {
  const results: ScriptCheckResult["results"] = [];
  for (const script of listScripts(projectDir)) {
    const result = await runGodotHeadless({ projectDir, args: ["--check-only", "-s", script] });
    results.push({ script, ...result });
  }
  return { ok: results.every((r) => r.code === 0), results };
}

/** `godot --headless --path <dir> -s res://test/smoke.gd`. */
export function smokeProject(projectDir: string): Promise<GodotRunResult> {
  return runGodotHeadless({ projectDir, args: ["-s", "res://test/smoke.gd"] });
}
