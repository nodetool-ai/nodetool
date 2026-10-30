import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { acquireInstallLock } from "../install-lock.js";

const desiredSchema = z.object({ root: z.string(), coreVersion: z.string(), packs: z.array(z.string()),
  runtimeLibraries: z.array(z.string()), dirty: z.boolean().optional() });
const stateSchema = z.record(z.string(), desiredSchema);
export type DesiredPackState = z.infer<typeof desiredSchema>;

export async function readDesiredState(file: string): Promise<z.infer<typeof stateSchema>> {
  try { return stateSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") { return {}; }
    throw error;
  }
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
