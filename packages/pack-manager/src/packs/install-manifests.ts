import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function captureInstallManifests(root: string): Promise<() => Promise<void>> {
  const files = await Promise.all(["package.json", "package-lock.json"].map(async (name) => {
    try { return { name, bytes: await readFile(join(root, name)) }; }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") { return { name, bytes: null }; }
      throw error;
    }
  }));
  return async () => {
    for (const file of files) {
      if (file.bytes) { await writeFile(join(root, file.name), file.bytes); }
      else { await unlink(join(root, file.name)).catch((error: unknown) => {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; }
      }); }
    }
  };
}
