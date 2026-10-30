import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { hostname } from "node:os";
import { z } from "zod";
import type { InstallMode } from "./mode.js";

const ownerSchema = z.object({ pid: z.number().int().positive().max(2_147_483_647), hostname: z.string(), token: z.string(), startedAt: z.string() });
export interface PackLockIssue { readonly kind: string; readonly message: string }

/** A killed installer can leave a valid tree without a desired-state dirty marker. */
export async function inspectPackInstallLock(mode: InstallMode): Promise<readonly PackLockIssue[]> {
  if (!mode.nodeModulesRoot) { return []; }
  const file = join(mode.nodeModulesRoot, ".nodetool-packs.lock");
  const issues: PackLockIssue[] = [];
  try {
    await stat(file + ".guard");
    issues.push({ kind: "install_guard", message: `Install lock guard exists at ${file}.guard. Confirm its owner stopped before removing it; repair never steals the guard.` });
  } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; } }
  try {
    const info = await stat(file);
    const owner = ownerSchema.parse(JSON.parse(await readFile(file, "utf8")));
    let stopped = false;
    if (owner.hostname === hostname()) {
      try { process.kill(owner.pid, 0); }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ESRCH") { stopped = true; }
        else if (!(error instanceof Error && "code" in error && error.code === "EPERM")) { throw error; }
      }
    }
    const interrupted = stopped || Date.now() - info.mtimeMs > 60_000;
    issues.push({ kind: interrupted ? "interrupted_install" : "active_install",
      message: interrupted ? `Interrupted install lock at ${file}. Run nodetool packs doctor --repair after its heartbeat expires.` : `An install is active at ${file}. Wait for it to finish before checking or repairing the tree.` });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      issues.push({ kind: "invalid_install_lock", message: `Cannot inspect install lock ${file}: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return issues;
}
