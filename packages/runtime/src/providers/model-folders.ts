/**
 * Extra model folders the local providers scan, from the `MODEL_FOLDERS`
 * setting. The main use is a ComfyUI `models` folder, which keeps each kind
 * of weight in its own subfolder, so the scan recurses.
 */
import { importNodeBuiltin } from "@nodetool-ai/config";

/** Deep enough for `models/<kind>/<family>/<variant>/file`, shallow enough to stop a runaway walk. */
const MAX_DEPTH = 8;

/**
 * The folders a `MODEL_FOLDERS` value names. Folders are separated by
 * newlines, `;`, or the platform path delimiter (`:` outside Windows).
 */
export function parseModelFolders(value: string | undefined, delimiter = ":"): string[] {
  if (!value) return [];
  const separators = new Set(["\n", "\r", ";", delimiter]);
  const folders: string[] = [];
  let current = "";
  for (const char of value) {
    if (separators.has(char)) {
      folders.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  folders.push(current);
  return [...new Set(folders.map((folder) => folder.trim()).filter(Boolean))];
}

/** The folders the setting names on this platform. */
export async function modelFolders(value: string | undefined): Promise<string[]> {
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  return parseModelFolders(value, path?.delimiter ?? ":");
}

/**
 * Absolute paths of every file under `folders` whose name ends in one of
 * `extensions` (lowercase, with the dot), sorted. Follows symlinked folders,
 * which ComfyUI setups often use, and visits each real folder once. Hidden
 * folders are skipped.
 */
export async function findModelFiles(
  folders: readonly string[],
  extensions: readonly string[]
): Promise<string[]> {
  const fsp = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  if (!fsp || !path || folders.length === 0) return [];
  const visited = new Set<string>();
  const files = new Set<string>();
  const matches = (name: string) => {
    const lower = name.toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext));
  };
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) return;
    let real: string;
    try {
      real = await fsp.realpath(dir);
    } catch {
      return;
    }
    if (visited.has(real)) return;
    visited.add(real);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        const stat = await fsp.stat(full).catch(() => null);
        isDir = stat?.isDirectory() ?? false;
        isFile = stat?.isFile() ?? false;
      }
      if (isDir) {
        await walk(full, depth + 1);
      } else if (isFile && matches(entry.name)) {
        files.add(full);
      }
    }
  };
  for (const folder of folders) {
    await walk(path.resolve(folder), 0);
  }
  return [...files].sort();
}

/**
 * Cache a per-file probe by path, size and modification time, so reopening
 * the model picker does not read every header again.
 */
export function cachedFileProbe<T>(
  probe: (file: string) => Promise<T>
): (file: string) => Promise<T> {
  const cache = new Map<string, { key: string; value: T }>();
  return async (file) => {
    const fsp = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
    const stat = await fsp?.stat(file).catch(() => null);
    const key = stat ? `${stat.size}:${stat.mtimeMs}` : "";
    const hit = cache.get(file);
    if (hit && key && hit.key === key) return hit.value;
    const value = await probe(file);
    if (key) cache.set(file, { key, value });
    return value;
  };
}
