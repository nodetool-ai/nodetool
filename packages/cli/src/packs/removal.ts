import { realpath, rm } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { acquireInstallLock } from "../install-lock.js";
import { assertLiveInstallAuthorization, assertInstallAuthorizationScope, type InstallAuthorization } from "../commands/pack-install-authorization.js";
import { DEFAULT_INSTALLER_OPERATIONS, type InstallerOperations } from "./installer.js";
import type { InstallPacksRequest, DesiredPackState } from "./install-selection.js";
import { preparePackRemoval } from "./removal-selection.js";
import { prepareTreeVerification } from "./install-verification.js";
import { captureInstallManifests } from "./install-manifests.js";
import { writeDesiredState } from "./install-state.js";
import { snapshotInstallTree, assertTreePins, assertSharedIdentities, installTreeRestored, parseInstallPlan, type TreePackage } from "./install-tree.js";

export interface PackRemovalResult { readonly desired: DesiredPackState; readonly removed: readonly string[]; readonly kept: readonly string[]; readonly restartRequired: true }
const removalEntry = z.object({ name: z.string(), version: z.string(), path: z.string().optional() });
function folderName(entry: TreePackage): string { return entry.path.split("node_modules/").at(-1)!; }

async function removeOwnedDirectories(root: string, nodeModules: string, paths: ReadonlySet<string>, before: readonly TreePackage[]): Promise<void> {
  const modules = await realpath(nodeModules);
  if (modules !== resolve(root, "node_modules")) { throw new Error("Removal root differs from the admitted tree"); }
  const protectedAncestors = new Set<string>();
  for (const entry of before.filter((entry) => !paths.has(entry.path))) {
    let prefix = ""; for (const segment of entry.path.split("/")) { prefix = prefix ? `${prefix}/${segment}` : segment; protectedAncestors.add(prefix); }
  }
  const current = await snapshotInstallTree(root);
  const removed = new Set<string>();
  for (const entry of current.filter((entry) => paths.has(entry.path)).sort((a, b) => a.path.length - b.path.length)) {
    let prefix = ""; let covered = false;
    for (const segment of entry.path.split("/")) { prefix = prefix ? `${prefix}/${segment}` : segment; if (removed.has(prefix)) { covered = true; break; } }
    if (covered) { continue; }
    if (protectedAncestors.has(entry.path)) { throw new Error(`Removal path contains a retained package: ${entry.path}`); }
    const target = resolve(root, entry.path); const within = relative(modules, target);
    if (!within || within === ".." || within.startsWith(`..${sep}`) || target !== await realpath(target) || dirname(target) !== await realpath(dirname(target))) { // key-boundary-ok: sep anchors the parent path component on this platform.
      throw new Error(`Removal path escapes the admitted tree: ${entry.path}`);
    }
    await rm(target, { recursive: true }); removed.add(entry.path);
  }
}

/** Explicit removal mutates only packages exclusively owned by its authorized IDs. */
export async function removePacks(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations = DEFAULT_INSTALLER_OPERATIONS): Promise<PackRemovalResult> {
  if (process.env["NODETOOL_PACKS_INSTALLER"] !== "1") { throw new Error("Node pack installer is disabled"); }
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  assertLiveInstallAuthorization(authorization);
  const initial = await preparePackRemoval(request);
  assertInstallAuthorizationScope(authorization, initial.authorization, "remove");
  const release = await acquireInstallLock(mode.nodeModulesRoot, ".nodetool-packs.lock", { signal: request.signal });
  try {
    const removal = await preparePackRemoval(request);
    const selection = removal.authorization;
    assertInstallAuthorizationScope(authorization, selection, "remove");
    const { root, before, previous, initialGlobalLockMissing } = selection;
    const removedIds = new Set(removal.remove);
    const surviving = { ...selection, packs: selection.packs.filter((pack) => !removedIds.has(pack.id)),
      runtimeLibraries: selection.runtimeLibraries.filter((id) => !removedIds.has(id)), before: before.filter((entry) => !removal.removePaths.has(entry.path)) };
    const verification = await prepareTreeVerification(surviving, mode.cliRoot);
    const desired: DesiredPackState = { root, coreVersion: mode.coreVersion,
      packs: previous.packs.filter((id) => !removedIds.has(id)), runtimeLibraries: previous.runtimeLibraries.filter((id) => !removedIds.has(id)) };
    if (!removal.npmNames.length) {
      await writeDesiredState(request.stateFile, desired);
      return { desired, removed: removal.remove, kept: removal.kept, restartRequired: true };
    }
    const version = await operations.npmVersion(root, request.signal, request.onWarning);
    const plan = parseInstallPlan(await operations.npm(root, ["uninstall", ...removal.npmNames, ...(Number(version.split(".")[0]) >= 11 ? ["--json"] : [])],
      { mode: "local", dryRun: true, signal: request.signal, onWarning: request.onWarning }), version);
    if (plan.add.length || plan.change.length) { throw new Error("Removal plan adds or changes installed packages"); }
    for (const raw of plan.remove) {
      const text = z.string().safeParse(raw);
      const parsed = text.success ? /^\s*remove\s+(\S+)\s+(\S+)/.exec(text.data) : null;
      const entry: z.infer<typeof removalEntry> = parsed ? { name: parsed[1], version: parsed[2] } : removalEntry.parse(raw);
      const matches = before.filter((old) => (old.name === entry.name || folderName(old) === entry.name) && old.version === entry.version &&
        (!entry.path || resolve(entry.path) === old.realPath));
      if (!matches.length || matches.some((old) => !removal.removePaths.has(old.path))) { throw new Error(`Removal plan affects a retained package: ${entry.name}`); }
    }
    const restoreManifests = await captureInstallManifests(root);
    try {
      await operations.npm(root, ["uninstall", ...removal.npmNames], { mode: "local", signal: request.signal, onWarning: request.onWarning });
      await removeOwnedDirectories(root, mode.nodeModulesRoot, removal.removePaths, before);
      if (mode.kind === "global") { await restoreManifests(); }
      const after = await snapshotInstallTree(root);
      const expected = before.filter((entry) => !removal.removePaths.has(entry.path));
      if (!installTreeRestored(expected, after, initialGlobalLockMissing)) { throw new Error("Removal changed a retained package or left an owned package installed"); }
      const shared = verification.shared.filter((pin) => after.some((entry) => entry.name === pin.name));
      assertTreePins(expected, after, [...verification.pins, ...shared], verification.coreNames, mode.coreVersion, initialGlobalLockMissing);
      await assertSharedIdentities(after, shared);
      await operations.loadCheck(mode, removal.remainingPackIds, request.signal);
      await writeDesiredState(request.stateFile, desired);
      return { desired, removed: removal.remove, kept: removal.kept, restartRequired: true };
    } catch (cause) {
      let restored = false;
      try {
        await restoreManifests();
        const replay = before.filter((entry) => !entry.path.slice("node_modules/".length).includes("/node_modules/")).map((entry) =>
          folderName(entry) === entry.name ? `${entry.name}@${entry.version}` : `${folderName(entry)}@npm:${entry.name}@${entry.version}`);
        await operations.npm(root, ["install", ...replay], { mode: mode.kind, onWarning: request.onWarning });
        restored = installTreeRestored(before, await snapshotInstallTree(root), initialGlobalLockMissing);
        if (restored) { await restoreManifests(); }
      } catch { restored = false; }
      if (!restored) {
        await writeDesiredState(request.stateFile, { ...previous, dirty: true });
        throw new Error("Pack removal failed and rollback did not restore the tree. Run nodetool packs doctor --repair.", { cause });
      }
      throw cause;
    }
  } finally { await release(); }
}
