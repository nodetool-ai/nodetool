import { spawn } from "node:child_process";
import { copyFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireInstallLock } from "../install-lock.js";
import { installerNpmVersion, runInstallerNpm } from "../npm-runner.js";
import { prepareInstallSelection, type InstallPacksRequest, type DesiredPackState, type InstallSelection, type PackOperation } from "./install-selection.js";
import { assertLiveInstallAuthorization, assertInstallAuthorizationScope, type InstallAuthorization } from "../commands/pack-install-authorization.js";
import { projectPins, verifyProjectTree } from "./install-verification.js";
import { writeDesiredState } from "./install-state.js";
import { readInstallTree } from "./install-tree.js";
import { activateGeneration, createGeneration, projectManifest, pruneGenerations } from "./project.js";
import { isRuntimePackageId, missingRuntimePackageDetails } from "@nodetool-ai/protocol/missing-runtime-package";

export type { DesiredPackState, InstallPacksRequest } from "./install-selection.js";

/** The pack project a load check imports from, beside the CLI that imports it. */
export interface LoadCheckTarget {
  readonly cliRoot: string;
  readonly projectRoot: string;
}

export interface InstallerOperations {
  readonly npmVersion: typeof installerNpmVersion;
  readonly npm: typeof runInstallerNpm;
  readonly loadCheck: (target: LoadCheckTarget, packs: readonly string[], signal?: AbortSignal) => Promise<void>;
}

export interface PackTransactionResult {
  readonly desired: DesiredPackState;
  readonly selection: InstallSelection;
}

function childLoadCheck(target: LoadCheckTarget, packs: readonly string[], signal?: AbortSignal): Promise<void> {
  const entry = fileURLToPath(new URL("./installer-load-check.js", import.meta.url));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, target.cliRoot, target.projectRoot, ...packs], {
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

/** Add packs and runtime libraries to the pack project. Requires a live command authorization. */
export async function installPacks(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations = DEFAULT_INSTALLER_OPERATIONS): Promise<DesiredPackState> {
  return (await runPackTransaction(request, authorization, operations, "install")).desired;
}

/** Rebuild the pack project from its recorded selection plus the desired set. */
export async function repairPackInstallation(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations = DEFAULT_INSTALLER_OPERATIONS): Promise<DesiredPackState> {
  return (await runPackTransaction(request, authorization, operations, "repair")).desired;
}

/**
 * Build the next pack project generation and switch to it. npm installs into
 * a fresh directory from the previous lockfile and the new package.json.
 * Verification, allowlisted scripts and a fresh-process load check run there.
 * Only then does the pointer move. Any failure deletes the new directory and
 * leaves the active generation untouched. The CLI's directory is never written.
 */
export async function runPackTransaction(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations, operation: PackOperation): Promise<PackTransactionResult> {
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  assertLiveInstallAuthorization(authorization);
  const initial = await prepareInstallSelection(request, operation);
  assertInstallAuthorizationScope(authorization, initial, operation, request);
  const release = await acquireInstallLock(mode.packsRoot, ".nodetool-packs.lock", { signal: request.signal });
  try {
    const selection = await prepareInstallSelection(request, operation);
    assertInstallAuthorizationScope(authorization, selection, operation, request);
    let pins;
    try { pins = projectPins(selection); }
    catch (error) { throw error instanceof Error ? withRuntimeLibraryFallback(error, selection.runtimeLibraries) : error; }
    const desired = desiredAfter(selection);
    const sameIds = (left: readonly string[], right: readonly string[]): boolean => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
    const unchanged = operation !== "repair" && selection.current !== null &&
      sameIds(selection.requested.packs, selection.active.packs) && sameIds(selection.requested.runtimeLibraries, selection.active.runtimeLibraries) &&
      selection.packs.every((pack) => selection.installedIds.includes(pack.id));
    if (unchanged || (operation === "remove" && selection.current === null)) {
      await writeDesiredState(request.stateFile, desired);
      return { desired, selection };
    }
    await operations.npmVersion(selection.root, request.signal, request.onWarning);
    const generation = await createGeneration(selection.root);
    try {
      await writeFile(join(generation, "package.json"), JSON.stringify(projectManifest(selection.requested, pins.roots), null, 2) + "\n");
      if (selection.current) {
        await copyFile(join(selection.current, "package-lock.json"), join(generation, "package-lock.json")).catch((error: unknown) => {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; }
        });
      }
      await operations.npm(generation, ["install"], { signal: request.signal, onWarning: request.onWarning });
      verifyProjectTree(await readInstallTree(generation), pins, selection.coreVersion);
      for (const pin of selection.scripts) {
        await operations.npm(generation, ["rebuild", pin.name], { rebuild: true, signal: request.signal, onWarning: request.onWarning });
      }
      const ids = selection.packs.map((pack) => pack.id);
      if (ids.length) { await operations.loadCheck({ cliRoot: mode.cliRoot, projectRoot: generation }, ids, request.signal); }
      await activateGeneration(selection.root, generation);
    } catch (cause) {
      await rm(generation, { recursive: true, force: true });
      throw cause;
    }
    await pruneGenerations(selection.root, [generation, selection.current]);
    await writeDesiredState(request.stateFile, desired);
    return { desired, selection };
  } finally { await release(); }
}

function desiredAfter(selection: InstallSelection): DesiredPackState {
  const requested = new Set(selection.requested.packs);
  return { root: selection.stateKey, coreVersion: selection.coreVersion, packs: selection.packs.map((pack) => pack.id),
    runtimeLibraries: [...selection.runtimeLibraries], requestedPacks: [...selection.requested.packs],
    managedPacks: selection.packs.filter((pack) => !requested.has(pack.id)).map((pack) => pack.id) };
}

/**
 * A refused runtime library can still be installed outside the managed tree.
 * Put that command in the refusal, so the user does not need a second error.
 */
function withRuntimeLibraryFallback(error: Error, libraries: readonly string[]): Error {
  const commands = libraries
    .filter(isRuntimePackageId)
    .map((id) => missingRuntimePackageDetails(id, id).bringYourOwn)
    .filter((command): command is string => Boolean(command));
  if (commands.length === 0) return error;
  return new Error(`${error.message}\nInstall it outside the managed tree instead:\n${commands.map((c) => `  ${c}`).join("\n")}`, { cause: error });
}
