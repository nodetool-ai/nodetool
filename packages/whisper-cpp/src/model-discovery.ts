import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ASRModel } from "@nodetool-ai/runtime";

function expand(value: string): string {
  return path.resolve(
    value.startsWith("~/") ? path.join(homedir(), value.slice(2)) : value
  );
}
export function getHfHubCacheDir(): string {
  if (process.env.HF_HUB_CACHE) {
    return expand(process.env.HF_HUB_CACHE);
  }
  return path.join(
    expand(process.env.HF_HOME || path.join(homedir(), ".cache/huggingface")),
    "hub"
  );
}
async function directories(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
async function discover(vad: boolean, modelsDir?: string): Promise<ASRModel[]> {
  const hub = getHfHubCacheDir();
  const dirs: string[] = [];
  for (const repo of [
    "models--ggerganov--whisper.cpp",
    "models--ggml-org--whisper.cpp",
    "models--ggml-org--whisper-vad"
  ]) {
    dirs.push(...(await directories(path.join(hub, repo, "snapshots"))));
  }
  const extra = modelsDir || process.env.WHISPER_CPP_MODELS_DIR;
  if (extra) {
    dirs.push(expand(extra));
  }
  const files = new Map<string, { model: ASRModel; mtime: number }>();
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
    const mtime = (await stat(dir)).mtimeMs;
    for (const entry of entries) {
      if (
        (!entry.isFile() && !entry.isSymbolicLink()) ||
        !/^ggml-.+\.bin$/i.test(entry.name) ||
        /silero|vad/i.test(entry.name) !== vad
      ) {
        continue;
      }
      const id = path.resolve(dir, entry.name);
      try {
        if (!(await stat(id)).isFile()) {
          continue;
        }
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          continue;
        }
        throw error;
      }
      if ((files.get(entry.name)?.mtime ?? -Infinity) > mtime) {
        continue;
      }
      files.set(entry.name, {
        model: {
          id,
          name: entry.name.replace(/^ggml-/i, "").replace(/\.bin$/i, ""),
          provider: "whisper_cpp"
        },
        mtime
      });
    }
  }
  return [...files.values()]
    .map((entry) => entry.model)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function discoverASRModels(modelsDir?: string): Promise<ASRModel[]> {
  return discover(false, modelsDir);
}
export function discoverVadModels(modelsDir?: string): Promise<ASRModel[]> {
  return discover(true, modelsDir);
}
export async function resolveModelPath(
  id: string,
  modelsDir?: string
): Promise<string> {
  // State saved before redaction stopped rewriting paths holds "~/..." ids.
  const wanted = expand(id);
  const model = (await discoverASRModels(modelsDir)).find(
    (entry) => entry.id === wanted
  );
  if (!model) {
    throw new Error(
      `Unknown whisper.cpp model "${id}". Download one from the Models panel.`
    );
  }
  return model.id;
}
