import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireInstallLock } from "../install-lock.js";
import { installerNpmVersion, runInstallerNpm } from "../npm-runner.js";
import { prepareInstallSelection, expandCatalogPacks, type InstallPacksRequest, type DesiredPackState } from "./install-selection.js";
import { assertLiveInstallAuthorization, assertInstallAuthorizationScope, type InstallAuthorization } from "../commands/pack-install-authorization.js";
import { prepareTreeVerification } from "./install-verification.js";
import { captureInstallManifests } from "./install-manifests.js";
import { normalizeGlobalBootstrap } from "./global-bootstrap.js";
import { normalizeOwnedPackReplay } from "./owned-replay-plan.js";
import { writeDesiredState } from "./install-state.js";
import type { InstallMode } from "./mode.js";
import { snapshotInstallTree, installTreeRestored, parseInstallPlan, assertAdditivePlan, assertTreePins, assertSharedIdentities, removeSnapshotAdditions, type VerificationPin } from "./install-tree.js";

export type { DesiredPackState, InstallPacksRequest } from "./install-selection.js";
export interface InstallerOperations {
  readonly npmVersion: typeof installerNpmVersion;
  readonly npm: typeof runInstallerNpm;
  readonly loadCheck: (mode: InstallMode, packs: readonly string[], signal?: AbortSignal) => Promise<void>;
}

function childLoadCheck(mode: InstallMode, packs: readonly string[], signal?: AbortSignal): Promise<void> {
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  const entry = fileURLToPath(new URL("./installer-load-check.js", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, mode.cliRoot, mode.installRoot, ...packs], {
      shell: false, stdio: ["ignore", "pipe", "pipe"], signal
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => { if (code === 0) { resolve(); } else { reject(new Error(`Pack load check failed (${String(code)}): ${output.trim()}`)); } });
  });
}

export const DEFAULT_INSTALLER_OPERATIONS: InstallerOperations = {
  npmVersion: installerNpmVersion, npm: runInstallerNpm, loadCheck: childLoadCheck
};

/** Additive install transaction. Requires a live command authorization. */
export async function installPacks(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations = DEFAULT_INSTALLER_OPERATIONS): Promise<DesiredPackState> {
  return installPacksTransaction(request, authorization, operations, "install");
}

/** Repair verifies the current pinned cohort and explicitly restores missing desired entries. */
export async function repairPackInstallation(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations = DEFAULT_INSTALLER_OPERATIONS): Promise<DesiredPackState> {
  return installPacksTransaction(request, authorization, operations, "repair");
}

async function installPacksTransaction(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations, operation: "install" | "repair"): Promise<DesiredPackState> {
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  assertLiveInstallAuthorization(authorization);
  const selectionOptions = operation === "repair" ? { allowDirty: true, restoreDesired: true } : {};
  const initial = await prepareInstallSelection(request, selectionOptions);
  assertInstallAuthorizationScope(authorization, initial, operation, request);
  const root = initial.root;
  const release = await acquireInstallLock(mode.nodeModulesRoot, ".nodetool-packs.lock", { signal: request.signal });
  try {
    const selection = await prepareInstallSelection(request, selectionOptions);
    assertInstallAuthorizationScope(authorization, selection, operation, request);
    const { previous, before, installedIds, packs, catalog, replayLibraries, initialGlobalLockMissing } = selection;
    const libraries = selection.runtimeLibraries;
    const version = await operations.npmVersion(root, request.signal, request.onWarning);
    const { pins: selectedPins, provided, runtimePins, shared, coreNames, libraryPins, pinByFolder } = await prepareTreeVerification(selection, mode.cliRoot);
    const bootstrap = selection.bootstrap ?? [];
    const pins = [...selectedPins, ...bootstrap];
    const spec = (pin: VerificationPin): string => pin.installName && pin.installName !== pin.name
      ? `${pin.installName}@npm:${pin.name}@${pin.version}` : `${pin.name}@${pin.version}`;
    const specs = [...new Set([...packs.map((pack) => spec(pack.npm)), ...provided.map(spec), ...runtimePins.map(spec), ...bootstrap.map(spec)])];
    const alreadyComplete = operation === "repair" && !initialGlobalLockMissing && pins.every((pin) => before.some((entry) => entry.name === pin.name && entry.version === pin.version && entry.integrity === pin.integrity));
    const plan = alreadyComplete ? { add: [], change: [], remove: [] } :
      parseInstallPlan(await operations.npm(root, ["install", ...specs, ...(Number(version.split(".")[0]) >= 11 ? ["--json"] : [])], { mode: mode.kind, dryRun: true, signal: request.signal, onWarning: request.onWarning }), version);
    assertAdditivePlan(normalizeGlobalBootstrap(normalizeOwnedPackReplay(plan, before, catalog, coreNames), bootstrap), before, coreNames, shared, mode.coreVersion);
    let desired: DesiredPackState = { root, coreVersion: mode.coreVersion, packs: [...new Set([...previous.packs, ...packs.filter((pack) => pack.kind !== "core").map((pack) => pack.id)])].sort(), runtimeLibraries: [...new Set([...previous.runtimeLibraries, ...libraries])].sort() };
    if (operation === "repair") { desired = { ...desired, dirty: false }; }
    const restoreSavedFiles = await captureInstallManifests(root);
    try {
      if (!alreadyComplete) { await operations.npm(root, ["install", ...specs], { mode: mode.kind, signal: request.signal, onWarning: request.onWarning }); }
      const after = await snapshotInstallTree(root);
      const installedShared = shared.filter((pin) => after.some((entry) => entry.name === pin.name));
      assertTreePins(before, after, [...pins, ...installedShared], coreNames, mode.coreVersion, initialGlobalLockMissing);
      if (mode.kind === "global" && after.some((entry) => entry.name === "@nodetool-ai/cli")) { throw new Error("Install added another CLI core package"); }
      await assertSharedIdentities(after, installedShared);
      for (const pin of new Map(packs.flatMap((pack) => pack.scriptAllowlist).map((pin) => [pin.name, pin])).values()) {
        if (operation === "repair" || !before.some((entry) => entry.name === pin.name && entry.version === pin.version && entry.integrity === pin.integrity)) {
          await operations.npm(root, ["rebuild", pin.name], { mode: mode.kind, rebuild: true, signal: request.signal, onWarning: request.onWarning });
        }
      }
      await operations.loadCheck(mode, packs.filter((pack) => pack.kind !== "core").map((pack) => pack.id), request.signal);
      await writeDesiredState(request.stateFile, desired);
      return desired;
    } catch (cause) {
      let restored = false;
      try {
        const oldPacks = expandCatalogPacks(catalog, installedIds);
        const oldSpecs = [...bootstrap.map(spec), ...oldPacks.map((pack) => spec(pack.npm)), ...oldPacks.flatMap((pack) => pack.provides.map((name) => {
          const pin = pinByFolder.get(name);
          if (!pin) { throw new Error(`Provided package ${name} has no rollback integrity pin`); }
          return spec(pin);
        })), ...replayLibraries.flatMap((id) => libraryPins(id).map(spec))];
        const oldNames = new Set(before.map((entry) => entry.name));
        const additions = [...new Set(plan.add.filter((entry) => !oldNames.has(entry.name)).map((entry) => entry.name))];
        // npm uninstall --no-save retains extraneous no-save additions. The
        // saving removal is confined to rollback and manifests are restored below.
        if (additions.length) { await operations.npm(root, ["uninstall", ...additions], { mode: "local", onWarning: request.onWarning }); }
        if (mode.kind === "global") {
          await removeSnapshotAdditions(root, mode.nodeModulesRoot, before);
          await restoreSavedFiles();
          await operations.npm(root, ["install", ...oldSpecs], { mode: mode.kind });
        }
        restored = installTreeRestored(before, await snapshotInstallTree(root), initialGlobalLockMissing);
        if (restored) { await restoreSavedFiles(); }
      } catch { restored = false; }
      if (!restored) {
        await writeDesiredState(request.stateFile, { ...previous, dirty: true });
        throw new Error("Pack install failed and rollback did not restore the tree. Run nodetool packs doctor --repair.", { cause });
      }
      if (operation === "repair") { await writeDesiredState(request.stateFile, { ...previous, dirty: true }); }
      throw cause;
    }
  } finally { await release(); }
}
