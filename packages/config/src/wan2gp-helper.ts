/**
 * NodeTool's helper inside the installed Wan2GP, and the model catalog it
 * writes.
 *
 * The helper runs in Wan2GP's own environment. It uses Wan2GP's public API
 * (`shared.api`) and its own download functions, the ones the Wan2GP UI uses.
 * Nothing in Wan2GP is changed.
 *
 * - `catalog <path>` writes every model with its capabilities, voices or
 *   languages, and whether its weights are on disk. The installer runs it
 *   once, so the model menus read a file instead of starting Wan2GP.
 * - `prepare <model>` downloads one model's weights into `ckpts/`. It first
 *   reports the size of the files still missing, from Hugging Face's
 *   headers, then the bytes written each second.
 */
import { z } from "zod";
import { importNodeBuiltin, safeProcessEnv } from "./node-import.js";

/** The helper, written next to the release it runs in. Python 3.10+. */
export const WAN2GP_HELPER_SOURCE = String.raw`"""NodeTool's helper inside Wan2GP's environment.

  catalog <path>    write every model with its capabilities and file status
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


def true_keys(value):
    return [key for key, flag in value.items() if flag is True] if isinstance(value, dict) else list(value or [])


def catalog_row(record, status):
    """One model in the shape Wan2GP's MCP model search returns."""
    media_inputs = {}
    for kind, roles in (record.get("media_inputs") or {}).items():
        if isinstance(roles, dict) and all(isinstance(flag, bool) for flag in roles.values()):
            enabled = true_keys(roles)
            if enabled:
                media_inputs[kind] = enabled
        elif roles:
            media_inputs[kind] = roles
    row = {
        "model_type": record.get("model_type"),
        "name": record.get("name") or record.get("model_type"),
        "family": record.get("family"),
        "base_model_type": record.get("base_model_type"),
        "main_output": list(record.get("main_output") or record.get("outputs") or []),
        "capabilities": true_keys(record.get("capabilities")),
        "media_inputs": media_inputs,
        "status": status,
    }
    mode = (record.get("setting_values") or {}).get("model_mode")
    if isinstance(mode, dict) and mode.get("choices"):
        row["model_modes"] = {
            "label": str(mode.get("label") or ""),
            "values": [str(choice.get("value")) if isinstance(choice, dict) else str(choice) for choice in mode["choices"]],
        }
    return row


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
    text_encoder = None
    text_encoder_urls = module.get_model_recursive_prop(model_type, "text_encoder_URLs", return_list=True, model_def=model_def)
    if text_encoder_urls:
        text_encoder = module.get_model_filename(
            model_type=model_type,
            quantization=module.text_encoder_quantization,
            dtype_policy=module.transformer_dtype_policy,
            URLs=text_encoder_urls,
        )
    return model_def, selected, text_encoder


def planned_size(module, model_type, model_def, filenames, weights):
    """Bytes still to fetch, from Hugging Face. Covers the files download_models fetches:
    the model's own URLs, its preload and VAE URLs, and its family's repository files."""
    from huggingface_hub import HfApi, get_hf_file_metadata

    present = set()
    for _directory, _dirs, files in os.walk(weights, followlinks=True):
        present.update(files)
    urls = list(filenames)
    urls += module.get_model_recursive_prop(model_type, "preload_URLs", return_list=True, model_def=model_def) or []
    vae = model_def.get("VAE_URLs", [])
    urls += [vae] if isinstance(vae, str) else list(vae or [])
    total = 0
    count = 0
    for url in dict.fromkeys(urls):
        if not isinstance(url, str) or not url.startswith("https://") or os.path.basename(url) in present:
            continue
        try:
            total += int(get_hf_file_metadata(url).size or 0)
            count += 1
        except Exception:
            continue
    api = HfApi()
    base_model_type = module.get_base_model_type(model_type)
    repos = module.model_types_handlers[base_model_type].query_model_files(
        lambda filename: [] if filename is None else [filename[filename.rfind("/") + 1:]], base_model_type, model_def
    )
    for repo in repos if isinstance(repos, list) else [repos]:
        if not repo or not repo.get("repoId"):
            continue
        for source, files in zip(repo.get("sourceFolderList") or [], repo.get("fileList") or []):
            prefix = f"{source.rstrip('/')}/" if source else ""
            try:
                if files:
                    paths = [prefix + name for name in files if os.path.basename(name) not in present]
                    entries = api.get_paths_info(repo["repoId"], paths) if paths else []
                else:
                    entries = [
                        entry
                        for entry in api.list_repo_tree(repo["repoId"], path_in_repo=source or None, recursive=True)
                        if os.path.basename(entry.path) not in present
                    ]
            except Exception:
                continue
            for entry in entries:
                size = getattr(entry, "size", None)
                if isinstance(size, int) and getattr(entry, "type", "file") != "directory":
                    total += size
                    count += 1
    return total, count


def prepare(module, model_type, model_def, selected, text_encoder):
    if not selected:
        module.download_models("", model_type, 0, -1, model_def=model_def)
    for filename, file_type, submodel_no in selected:
        module.download_models(filename, model_type, file_type, submodel_no, model_def=model_def)
    if text_encoder:
        module.download_models(text_encoder, model_type, 2, -1, force_path=model_def.get("text_encoder_folder"), model_def=model_def)


def folder_state(root):
    """Bytes under root and the files written in the last seconds."""
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
    argument = sys.argv[2] if len(sys.argv) > 2 else ""
    root = Path.cwd()
    sys.path.insert(0, str(root))
    with contextlib.redirect_stdout(sys.stderr):
        from shared.api import init

        session = init(root=str(root), console_output=True, console_isatty=False)
        session.ensure_ready()
        if command == "catalog" and argument:
            records = session.list_model_metadata()
            status = {record["model_type"]: record["status"] for record in session.list_model_availability()}
            rows = [catalog_row(record, status.get(record.get("model_type"), "missing")) for record in records]
            target = Path(argument)
            partial = target.with_name(target.name + ".partial")
            partial.write_text(json.dumps({"version": 1, "models": rows}), encoding="utf-8")
            os.replace(partial, target)
            emit({"type": "catalog", "count": len(rows)})
            return 0
        if command == "prepare" and argument:
            runtime = session._ensure_runtime()
            module = runtime.module
            weights = root / "ckpts"
            with working_directory(runtime.root):
                model_def, selected, text_encoder = model_files(module, argument)
                filenames = [filename for filename, _, _ in selected] + ([text_encoder] if text_encoder else [])
                try:
                    total, count = planned_size(module, argument, model_def, filenames, weights)
                except Exception as error:
                    # The estimate is optional. Without it the bar shows bytes only.
                    print(f"No download size estimate: {error}", file=sys.stderr)
                    total, count = 0, 0
                emit({"type": "total", "total_bytes": total, "total_files": count})
                start, _ = folder_state(weights)
                stop = threading.Event()

                def observe():
                    while not stop.wait(1.0):
                        size, recent = folder_state(weights)
                        emit({"type": "progress", "downloaded_bytes": max(0, size - start), "current_files": recent})

                observer = threading.Thread(target=observe, daemon=True)
                observer.start()
                try:
                    prepare(module, argument, model_def, selected, text_encoder)
                finally:
                    stop.set()
                    observer.join(timeout=2)
            emit({"type": "done", "status": session.get_model_availability(argument)["status"]})
            return 0
    raise SystemExit(f"Unknown command: {' '.join(sys.argv[1:])}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"Wan2GP helper failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
`;

/** Where Wan2GP's interpreter and source are. */
export interface Wan2GPHelperTarget {
  sourceDir?: string;
  python?: string;
}

/** One protocol line of the helper's stdout. */
export const Wan2GPHelperLineSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("catalog"), count: z.number() }),
  z.object({ type: z.literal("total"), total_bytes: z.number(), total_files: z.number() }),
  z.object({ type: z.literal("progress"), downloaded_bytes: z.number(), current_files: z.array(z.string()) }),
  z.object({ type: z.literal("done"), status: z.string() })
]);
export type Wan2GPHelperLine = z.infer<typeof Wan2GPHelperLineSchema>;

/**
 * Run the helper with `args` and pass each protocol line to `onLine`.
 * Rejects with Wan2GP's last lines of output when it fails.
 */
export async function runWan2GPHelper(
  target: Wan2GPHelperTarget,
  args: string[],
  onLine: (line: Wan2GPHelperLine) => void,
  signal?: AbortSignal
): Promise<void> {
  const { python, sourceDir } = target;
  if (!python || !sourceDir) throw new Error("Wan2GP is not installed.");
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  const childProcess = await importNodeBuiltin<typeof import("node:child_process")>("node:child_process");
  if (!fs || !path || !childProcess) throw new Error("The Wan2GP helper needs Node.js");
  const script = path.join(path.dirname(sourceDir), "nodetool_wan2gp.py");
  await fs.writeFile(script, WAN2GP_HELPER_SOURCE);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(safeProcessEnv())) {
    if (value !== undefined) env[key] = value;
  }
  for (const key of ["PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"]) delete env[key];
  env.PYTHONUNBUFFERED = "1";
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = childProcess.spawn(python, [script, ...args], {
      cwd: sourceDir,
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
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          // Wan2GP's own output that reached stdout.
        }
        const line = Wan2GPHelperLineSchema.safeParse(parsed);
        if (line.success) onLine(line.data);
        else tail.push(text);
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
      reject(new Error(`Could not run Wan2GP's interpreter: ${error.message}`));
    });
    child.once("close", (code) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) reject(signal.reason instanceof Error ? signal.reason : new Error("Cancelled"));
      else if (code === 0) resolve();
      else reject(new Error(`Wan2GP stopped with exit code ${code}:\n${tail.join("\n")}`));
    });
  });
}

/** The weights of one model, as Wan2GP's model selector reports them. */
export const Wan2GPFileStatusSchema = z.enum(["available", "partial", "missing"]);
export type Wan2GPFileStatus = z.infer<typeof Wan2GPFileStatusSchema>;

/** One model, in the shape of a row of Wan2GP's MCP model search. */
export const Wan2GPCatalogRowSchema = z
  .object({
    model_type: z.string(),
    name: z.string(),
    family: z.string().nullish(),
    base_model_type: z.string().nullish(),
    main_output: z.array(z.string()),
    capabilities: z.array(z.string()),
    media_inputs: z.record(z.string(), z.unknown()),
    model_modes: z.object({ label: z.string(), values: z.array(z.string()) }).optional(),
    status: Wan2GPFileStatusSchema
  })
  .passthrough();
export type Wan2GPCatalogRow = z.infer<typeof Wan2GPCatalogRowSchema>;

const CatalogSchema = z.object({ version: z.literal(1), models: z.array(Wan2GPCatalogRowSchema) });

/** The catalog sits beside the release's source, so an update writes a new one. */
export async function wan2gpCatalogPath(sourceDir: string): Promise<string> {
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!path) throw new Error("The Wan2GP catalog needs Node.js");
  return path.join(path.dirname(sourceDir), "catalog.json");
}

/** Write the installed Wan2GP's catalog. Wan2GP starts its runtime for it but loads no model. */
export async function writeWan2GPCatalog(target: Wan2GPHelperTarget, signal?: AbortSignal): Promise<number> {
  if (!target.sourceDir) throw new Error("Wan2GP is not installed.");
  let count = -1;
  await runWan2GPHelper(
    target,
    ["catalog", await wan2gpCatalogPath(target.sourceDir)],
    (line) => {
      if (line.type === "catalog") count = line.count;
    },
    signal
  );
  if (count < 0) throw new Error("Wan2GP's helper wrote no model catalog");
  return count;
}

/** The installed Wan2GP's catalog, or null when there is none or it does not parse. */
export async function readWan2GPCatalog(sourceDir: string): Promise<Wan2GPCatalogRow[] | null> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  if (!fs) return null;
  try {
    const parsed = CatalogSchema.safeParse(JSON.parse(await fs.readFile(await wan2gpCatalogPath(sourceDir), "utf8")));
    return parsed.success ? parsed.data.models : null;
  } catch {
    return null;
  }
}

/** Record a model's file status in the catalog, after a download or a generation. */
export async function setWan2GPCatalogStatus(
  sourceDir: string,
  modelType: string,
  status: Wan2GPFileStatus
): Promise<void> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const models = await readWan2GPCatalog(sourceDir);
  const row = models?.find((model) => model.model_type === modelType);
  if (!fs || !models || !row || row.status === status) return;
  row.status = status;
  const file = await wan2gpCatalogPath(sourceDir);
  await fs.writeFile(`${file}.partial`, JSON.stringify({ version: 1, models }));
  await fs.rename(`${file}.partial`, file);
}
