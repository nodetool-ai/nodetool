import { mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { acquireInstallLock } from "../install-lock.js";
import type { ManagedInstallMode } from "./mode.js";

const desiredSchema = z.object({ root: z.string(), coreVersion: z.string(), packs: z.array(z.string()),
  runtimeLibraries: z.array(z.string()),
  requestedPacks: z.array(z.string()).optional(), managedPacks: z.array(z.string()).optional(), dirty: z.boolean().optional() });
const stateSchema = z.record(z.string(), desiredSchema);
export type DesiredPackState = z.infer<typeof desiredSchema>;

export async function readDesiredState(file: string): Promise<z.infer<typeof stateSchema>> {
  try { return stateSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") { return {}; }
    throw error;
  }
}

/** Desired state is keyed by the packs home, which stays the same across core versions. */
export function desiredStateKey(mode: ManagedInstallMode): string {
  return resolve(dirname(mode.packsRoot));
}

/**
 * The desired set for this packs home. Earlier releases keyed it by the CLI
 * or project directory they installed into, so that entry is the fallback
 * that lets an upgraded CLI offer to restore the same packs.
 */
export async function readDesiredFor(file: string, mode: ManagedInstallMode): Promise<DesiredPackState | undefined> {
  const state = await readDesiredState(file);
  const current = state[desiredStateKey(mode)];
  if (current) { return current; }
  const legacy = await realpath(mode.legacyInstallRoot).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") { return mode.legacyInstallRoot; }
    throw error;
  });
  return state[legacy];
}

/** Each root transaction also serializes merging the shared desired-state file. */
export async function writeDesiredState(file: string, value: DesiredPackState): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const release = await acquireInstallLock(dirname(file), ".cli-packs-state.lock");
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const state = await readDesiredState(file);
    state[value.root] = value;
    await writeFile(temporary, JSON.stringify(state, null, 2), { flag: "wx", mode: 0o600 }); await rename(temporary, file);
  } finally {
    try { await unlink(temporary).catch((error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; }
    }); } finally { await release(); }
  }
}
