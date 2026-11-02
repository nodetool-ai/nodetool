/**
 * Model files of the Wan2GP the Package Manager installed: which models have
 * their weights on disk, and downloading a model's weights.
 *
 * Wan2GP's MCP server downloads a model's files only as part of a generation.
 * These run a short helper in Wan2GP's own environment instead. It uses
 * Wan2GP's public API (`shared.api`) and its own download functions, the same
 * the Wan2GP UI uses, so the files land where Wan2GP looks for them
 * (`ckpts/`). Nothing in Wan2GP is changed.
 */
import { createLogger, importNodeBuiltin, type Wan2GPInstallStatus } from "@nodetool-ai/config";
import { Wan2GPError } from "./wan2gp-client.js";

const log = createLogger("nodetool.runtime.providers.wan2gp-models");

/** The weights of one model, as Wan2GP's model selector reports them. */
export type Wan2GPFileStatus = "available" | "partial" | "missing";

export interface Wan2GPDownloadProgress {
  downloadedBytes: number;
  currentFiles: string[];
}

/** The helper, written next to the release it runs in. Python 3.10+. */
export const WAN2GP_HELPER_SOURCE = String.raw`"""NodeTool's helper inside Wan2GP's environment.

  status            report every model's file status as Wan2GP's UI shows it
  prepare <model>   download one model's files, reporting progress

Protocol lines go to stdout as JSON. Wan2GP's own output goes to stderr.
"""
import contextlib
import json
import os
import sys
import threading
import time
from pathlib import Path


@contextlib.contextmanager
def working_directory(path):
    previous = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(previous)


def model_files(module, model_type):
    """Wan2GP's own pre-load file selection, stopping before loading a model."""
    model_def = module.get_model_def(model_type)
    if model_def is None:
        raise ValueError(f"Unknown Wan2GP model_type: {model_type}")
    quantization = module.transformer_quantization
    dtype_policy = module.transformer_dtype_policy
    selected = []
    primary = module.get_model_filename(model_type=model_type, quantization=quantization, dtype_policy=dtype_policy, model_def=model_def)
    if primary:
        selected.append((primary, 0, 1))
    if "URLs2" in model_def:
        secondary = module.get_model_filename(model_type=model_type, quantization=quantization, dtype_policy=dtype_policy, submodel_no=2, model_def=model_def)
        if secondary:
            selected.append((secondary, 0, 2))
    for module_type in module.get_model_recursive_prop(model_type, "modules", return_list=True, model_def=model_def):
        if isinstance(module_type, dict):
            for submodel_no, key in ((1, "URLs"), (2, "URLs2")):
                urls = module_type.get(key)
                if urls is None:
                    raise ValueError(f"Wan2GP module is missing {key}: {module_type}")
                filename = module.get_model_filename(model_type, quantization, dtype_policy, URLs=urls)
                if filename:
                    selected.append((filename, 1, submodel_no))
        else:
            filename = module.get_model_filename(model_type, quantization, dtype_policy, module_type=module_type)
            if filename:
                selected.append((filename, 1, 0))
    return model_def, selected


def prepare(module, model_type):
    model_def, selected = model_files(module, model_type)
    if not selected:
        module.download_models("", model_type, 0, -1, model_def=model_def)
    for filename, file_type, submodel_no in selected:
        module.download_models(filename, model_type, file_type, submodel_no, model_def=model_def)
    text_encoder_urls = module.get_model_recursive_prop(model_type, "text_encoder_URLs", return_list=True, model_def=model_def)
    if text_encoder_urls:
        text_encoder = module.get_model_filename(
            model_type=model_type,
            quantization=module.text_encoder_quantization,
            dtype_policy=module.transformer_dtype_policy,
            URLs=text_encoder_urls,
        )
        if text_encoder:
            module.download_models(text_encoder, model_type, 2, -1, force_path=model_def.get("text_encoder_folder"), model_def=model_def)


def folder_state(root):
    total = 0
    recent = []
    now = time.time()
    for directory, _dirs, files in os.walk(root, followlinks=True):
        for name in files:
            try:
                stat = os.stat(os.path.join(directory, name))
            except OSError:
                continue
            total += stat.st_size
            if now - stat.st_mtime < 5:
                recent.append(name)
    return total, recent[:8]


def main():
    out = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8", buffering=1)
    sys.stdout.flush()
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())

    def emit(payload):
        out.write(json.dumps(payload, separators=(",", ":")) + "\n")
        out.flush()

    command = sys.argv[1] if len(sys.argv) > 1 else ""
    root = Path.cwd()
    sys.path.insert(0, str(root))
    with contextlib.redirect_stdout(sys.stderr):
        from shared.api import init

        session = init(root=str(root), console_output=True, console_isatty=False)
        session.ensure_ready()
        if command == "status":
            records = session.list_model_availability()
            emit({"type": "status", "models": {record["model_type"]: record["status"] for record in records}})
            return 0
        if command == "prepare" and len(sys.argv) > 2:
            model_type = sys.argv[2]
            runtime = session._ensure_runtime()
            weights = root / "ckpts"
            start, _ = folder_state(weights)
            stop = threading.Event()

            def observe():
                while not stop.wait(1.0):
                    total, recent = folder_state(weights)
                    emit({"type": "progress", "downloaded_bytes": max(0, total - start), "current_files": recent})

            observer = threading.Thread(target=observe, daemon=True)
            observer.start()
            try:
                with working_directory(runtime.root):
                    prepare(runtime.module, model_type)
            finally:
                stop.set()
                observer.join(timeout=2)
            emit({"type": "done", "status": session.get_model_availability(model_type)["status"]})
            return 0
    raise SystemExit(f"Unknown command: {' '.join(sys.argv[1:])}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Wan2GP helper failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
`;

type HelperLine =
  | { type: "status"; models: Record<string, string> }
  | { type: "progress"; downloaded_bytes: number; current_files: string[] }
  | { type: "done"; status: string };

function isStatus(value: string): value is Wan2GPFileStatus {
  return value === "available" || value === "partial" || value === "missing";
}

/**
 * Run the helper with `args` in the installed Wan2GP and pass each protocol
 * line to `onLine`. Rejects with Wan2GP's last output when it fails.
 */
async function runHelper(
  install: Wan2GPInstallStatus,
  args: string[],
  onLine: (line: HelperLine) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!install.python || !install.sourceDir) {
    throw new Wan2GPError("Wan2GP is not installed.");
  }
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  const childProcess = await importNodeBuiltin<typeof import("node:child_process")>("node:child_process");
  if (!fs || !path || !childProcess) throw new Error("The Wan2GP helper needs Node.js");
  const script = path.join(path.dirname(install.sourceDir), "nodetool_wan2gp.py");
  await fs.writeFile(script, WAN2GP_HELPER_SOURCE);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  for (const key of ["PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"]) delete env[key];
  env.PYTHONUNBUFFERED = "1";
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = childProcess.spawn(install.python!, [script, ...args], {
      cwd: install.sourceDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const tail: string[] = [];
    let buffer = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const text = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!text) continue;
        try {
          onLine(JSON.parse(text) as HelperLine);
        } catch {
          tail.push(text);
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString("utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        tail.push(line);
        if (tail.length > 30) tail.shift();
      }
    });
    const onAbort = (): void => {
      child.kill();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(new Wan2GPError(`Could not run Wan2GP's interpreter: ${error.message}`));
    });
    child.once("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) reject(signal.reason instanceof Error ? signal.reason : new Error("Cancelled"));
      else if (code === 0) resolve();
      else reject(new Wan2GPError(`Wan2GP stopped with exit code ${code}:\n${tail.join("\n")}`));
    });
  });
}

interface StatusCache {
  key: string;
  models: Map<string, Wan2GPFileStatus>;
  pending: Promise<Map<string, Wan2GPFileStatus>> | null;
}

let cache: StatusCache | null = null;
/** What downloads and generations in this process proved, applied over every read. */
const proven = new Map<string, Wan2GPFileStatus>();

/**
 * Every model's file status. The first call per install runs the helper,
 * which starts Wan2GP's runtime; later calls answer from memory, which
 * downloads and generations keep current.
 */
export async function wan2gpFileStatus(install: Wan2GPInstallStatus): Promise<Map<string, Wan2GPFileStatus>> {
  const key = `${install.sourceDir}|${install.commit}`;
  if (cache?.key === key) {
    return cache.pending ?? cache.models;
  }
  const entry: StatusCache = { key, models: new Map(), pending: null };
  cache = entry;
  entry.pending = (async () => {
    try {
      await runHelper(install, ["status"], (line) => {
        if (line.type !== "status") return;
        for (const [modelType, status] of Object.entries(line.models)) {
          if (isStatus(status)) entry.models.set(modelType, status);
        }
        for (const [modelType, status] of proven) entry.models.set(modelType, status);
      });
    } catch (error) {
      log.warn("Could not read Wan2GP's model file status", { error: String(error) });
      if (cache === entry) cache = null;
      throw error;
    } finally {
      entry.pending = null;
    }
    return entry.models;
  })();
  return entry.pending;
}

/** Record a model whose files a generation or download just proved present. */
export function markWan2GPModelAvailable(modelType: string): void {
  proven.set(modelType, "available");
  cache?.models.set(modelType, "available");
}

/** Forget the cached status, so the next listing reads it again. */
export function resetWan2GPFileStatus(): void {
  cache = null;
  proven.clear();
}

/**
 * Download one model's files with Wan2GP's own downloader. Resolves with the
 * model's status afterwards, which is `available` when every file is on disk.
 */
export async function downloadWan2GPModel(
  install: Wan2GPInstallStatus,
  modelType: string,
  options: { signal?: AbortSignal; onProgress?: (progress: Wan2GPDownloadProgress) => void } = {}
): Promise<Wan2GPFileStatus> {
  let final: Wan2GPFileStatus | null = null;
  await runHelper(
    install,
    ["prepare", modelType],
    (line) => {
      if (line.type === "progress") {
        options.onProgress?.({ downloadedBytes: line.downloaded_bytes, currentFiles: line.current_files });
      } else if (line.type === "done" && isStatus(line.status)) {
        final = line.status;
      }
    },
    options.signal
  );
  const status: Wan2GPFileStatus = final ?? "missing";
  proven.set(modelType, status);
  cache?.models.set(modelType, status);
  return status;
}
