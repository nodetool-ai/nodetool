/**
 * Find one file of a Hugging Face repository in the local hub cache, where
 * the model picker downloads model files.
 */
import { getHfHubCacheDir, importNodeBuiltin } from "@nodetool-ai/config";

/** A file's path in the Hugging Face hub cache, from the `main` snapshot first. */
export async function resolveHubFile(repoId: string, file: string): Promise<string | null> {
  const fs = await importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises");
  const path = await importNodeBuiltin<typeof import("node:path")>("node:path");
  const hub = await getHfHubCacheDir();
  if (!fs || !path || !hub) {
    return null;
  }
  const repoDir = path.join(hub, `models--${repoId.replace("/", "--")}`);
  const snapshots: string[] = [];
  try {
    snapshots.push((await fs.readFile(path.join(repoDir, "refs", "main"), "utf8")).trim());
  } catch {
    // No ref: look through every snapshot.
  }
  try {
    snapshots.push(...(await fs.readdir(path.join(repoDir, "snapshots"))));
  } catch {
    return null;
  }
  for (const snapshot of snapshots) {
    const candidate = path.join(repoDir, "snapshots", snapshot, file);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile() && stat.size > 0) {
        return candidate;
      }
    } catch {
      // Not in this snapshot.
    }
  }
  return null;
}
