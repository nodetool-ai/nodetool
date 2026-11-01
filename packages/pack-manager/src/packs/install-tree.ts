import { readFile, readdir, realpath } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { z } from "zod";
import type { PinnedPackage } from "@nodetool-ai/pack-core";
export interface VerificationPin extends PinnedPackage { readonly installName?: string; readonly shared?: boolean; readonly installPath?: string }

export interface TreePackage {
  readonly path: string;
  readonly name: string;
  readonly version: string;
  readonly integrity: string | undefined;
  readonly realPath: string;
}
const manifestSchema = z.object({ name: z.string(), version: z.string() });
const lockSchema = z.object({ packages: z.record(z.string(), z.object({
  version: z.string().optional(), integrity: z.string().optional()
})) });

/** Inspect every nested package of a pack project against npm's hidden lock. */
export async function readInstallTree(root: string): Promise<readonly TreePackage[]> {
  let lock: z.infer<typeof lockSchema> | undefined;
  let raw: string | undefined;
  try { raw = await readFile(join(root, "node_modules/.package-lock.json"), "utf8"); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; }
  }
  if (raw !== undefined) { lock = lockSchema.parse(JSON.parse(raw)); }
  const result: TreePackage[] = [];
  const pending = [join(root, "node_modules")];
  while (pending.length) {
    const modules = pending.pop()!;
    let entries;
    try { entries = await readdir(modules, { withFileTypes: true }); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") { continue; }
      throw error;
    }
    const directories: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) { continue; }
      if (entry.name.startsWith("@")) {
        for (const scoped of await readdir(join(modules, entry.name))) {
          directories.push(join(modules, entry.name, scoped));
        }
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        directories.push(join(modules, entry.name));
      }
    }
    for (const directory of directories) {
      const actual = await realpath(directory);
      if (actual !== resolve(directory)) { throw new Error(`Installer refuses linked package ${directory}`); }
      const manifest = manifestSchema.parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
      const path = relative(root, directory).replaceAll("\\", "/");
      const pinned = lock?.packages[path];
      if (lock && (!pinned || pinned.version !== manifest.version)) { throw new Error(`Hidden lock is missing or stale for ${path}`); }
      result.push({ path, name: manifest.name, version: manifest.version, integrity: pinned?.integrity, realPath: actual });
      pending.push(join(directory, "node_modules"));
    }
  }
  // npm writes no hidden lock for a project without dependencies.
  if (!lock && result.length > 0) { throw new Error(`Hidden lock is missing for ${root}`); }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
