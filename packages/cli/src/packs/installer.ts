import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import { acquireInstallLock } from "../install-lock.js";
import { installerNpmVersion, runInstallerNpm } from "../npm-runner.js";
import { prepareInstallSelection, readDesiredState, expandCatalogPacks, type InstallPacksRequest, type DesiredPackState } from "./install-selection.js";
import { assertLiveInstallAuthorization, assertInstallAuthorizationScope, type InstallAuthorization } from "../commands/pack-install-authorization.js";
import type { InstallMode } from "./mode.js";
import { snapshotInstallTree, installTreeRestored, parseInstallPlan, assertAdditivePlan, assertTreePins, assertSharedIdentities, removeSnapshotAdditions, type VerificationPin } from "./install-tree.js";

export type { DesiredPackState, InstallPacksRequest } from "./install-selection.js";
export interface InstallerOperations {
  readonly npmVersion: typeof installerNpmVersion;
  readonly npm: typeof runInstallerNpm;
  readonly loadCheck: (mode: InstallMode, packs: readonly string[], signal?: AbortSignal) => Promise<void>;
}

async function writeState(file: string, value: DesiredPackState): Promise<void> {
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

/** Additive install transaction. No command can enable it without both flag and authorization. */
export async function installPacks(request: InstallPacksRequest, authorization: InstallAuthorization, operations: InstallerOperations = {
  npmVersion: installerNpmVersion, npm: runInstallerNpm, loadCheck: childLoadCheck
}): Promise<DesiredPackState> {
  if (process.env["NODETOOL_PACKS_INSTALLER"] !== "1") { throw new Error("Node pack installer is disabled. Set NODETOOL_PACKS_INSTALLER=1 to enable the preview."); }
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  assertLiveInstallAuthorization(authorization);
  const initial = await prepareInstallSelection(request);
  assertInstallAuthorizationScope(authorization, initial);
  const root = initial.root;
  const release = await acquireInstallLock(mode.nodeModulesRoot, ".nodetool-packs.lock", { signal: request.signal });
  try {
    const selection = await prepareInstallSelection(request);
    assertInstallAuthorizationScope(authorization, selection);
    const { previous, before, installedIds, packs, catalog, replayLibraries, initialGlobalLockMissing } = selection;
    const libraries = selection.runtimeLibraries;
    const version = await operations.npmVersion(root, request.signal, request.onWarning);
    const installPins: readonly VerificationPin[] = catalog.installPins ?? [];
    const pinByFolder = new Map(installPins.map((pin) => [pin.installName ?? pin.name, pin]));
    const libraryPins = (id: string): readonly VerificationPin[] => {
      if (!isRuntimeNpmPackageId(id)) { throw new Error(`Unknown runtime library: ${id}`); }
      return RUNTIME_NPM_PACKAGES[id].packageNames.map((name, index) => {
        const pin = pinByFolder.get(name);
        if (!pin) { throw new Error(`Runtime library ${id} has no integrity pins; installation is unavailable until catalog pins are supplied.`); }
        const spec = pin.installName && pin.installName !== pin.name ? `${pin.installName}@npm:${pin.name}@${pin.version}` : `${pin.name}@${pin.version}`;
        if (spec !== RUNTIME_NPM_PACKAGES[id].npmPackages[index]) { throw new Error(`Runtime library ${id} pin differs from its exact runtime spec: ${name}`); }
        return pin;
      });
    };
    const runtimePins = libraries.flatMap((id) => {
      return libraryPins(id);
    });
    const provided = packs.flatMap((pack) => pack.provides.map((name) => {
      const pin = pinByFolder.get(name);
      if (!pin) { throw new Error(`Provided package ${name} has no integrity pin`); }
      return pin;
    }));
    const shared = installPins.filter((pin) => pin.shared);
    for (const name of ["mediabunny", "@mediabunny/server"]) {
      if (before.some((entry) => entry.name === name) && !shared.some((pin) => pin.name === name)) {
        throw new Error(`Shared library ${name} has no integrity pin`);
      }
    }
    const pins = [...packs.map((pack) => pack.npm), ...provided, ...runtimePins, ...packs.flatMap((pack) => pack.scriptAllowlist),
      ...shared.filter((pin) => before.some((entry) => entry.name === pin.name))];
    if (pins.some((pin) => !pin.integrity || pin.integrity === "PENDING")) { throw new Error("Installation requires published integrity pins"); }
    const packNames = new Set(catalog.packs.filter((pack) => pack.kind === "node-pack").flatMap((pack) => [pack.npm.name, ...pack.provides]));
    const coreNames = new Set([...before.filter((entry) => entry.name.startsWith("@nodetool-ai/") && !packNames.has(entry.name)).map((entry) => entry.name),
      ...catalog.packs.filter((pack) => pack.kind === "core").map((pack) => pack.npm.name)]);
    const dependencySchema = z.object({ dependencies: z.record(z.string(), z.string()).optional(),
      optionalDependencies: z.record(z.string(), z.string()).optional(), peerDependencies: z.record(z.string(), z.string()).optional(),
      peerDependenciesMeta: z.record(z.string(), z.object({ optional: z.boolean().optional() })).optional() });
    for (const directory of [mode.cliRoot, ...before.filter((entry) => coreNames.has(entry.name)).map((entry) => entry.realPath)]) {
      const manifest = dependencySchema.parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
      const requiredPeers = Object.keys(manifest.peerDependencies ?? {}).filter((name) => !manifest.peerDependenciesMeta?.[name]?.optional);
      for (const name of [...Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }), ...requiredPeers]) {
        if (name.startsWith("@nodetool-ai/") && !packNames.has(name)) { coreNames.add(name); }
      }
    }
    if (initialGlobalLockMissing) {
      for (const pin of pins) {
        const existing = before.filter((entry) => entry.name === pin.name);
        if (existing.some((entry) => entry.version !== pin.version)) { throw new Error(`Global baseline package version differs from pin: ${pin.name}`); }
        if (shared.some((identity) => identity.name === pin.name) && existing.length !== 1) { throw new Error(`Shared library must exist exactly once: ${pin.name}`); }
      }
    }
    assertTreePins(before, before, pins.filter((pin) => before.some((entry) => entry.name === pin.name && (!initialGlobalLockMissing || entry.integrity !== undefined))), coreNames, mode.coreVersion);
    const spec = (pin: VerificationPin): string => pin.installName && pin.installName !== pin.name
      ? `${pin.installName}@npm:${pin.name}@${pin.version}` : `${pin.name}@${pin.version}`;
    const specs = [...new Set([...packs.map((pack) => spec(pack.npm)), ...provided.map(spec), ...runtimePins.map(spec)])];
    const plan = parseInstallPlan(await operations.npm(root, ["install", ...specs, ...(Number(version.split(".")[0]) >= 11 ? ["--json"] : [])], { mode: mode.kind, dryRun: true, signal: request.signal, onWarning: request.onWarning }), version);
    assertAdditivePlan(plan, before, coreNames, shared, mode.coreVersion);
    const desired: DesiredPackState = { root, coreVersion: mode.coreVersion, packs: [...new Set([...previous.packs, ...packs.filter((pack) => pack.kind === "node-pack").map((pack) => pack.id)])].sort(), runtimeLibraries: [...new Set([...previous.runtimeLibraries, ...libraries])].sort() };
    const savedFiles = await Promise.all(["package.json", "package-lock.json"].map(async (name) => {
      try { return { name, bytes: await readFile(join(root, name)) }; }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") { return { name, bytes: null }; }
        throw error;
      }
    }));
    const restoreSavedFiles = async (): Promise<void> => {
      for (const file of savedFiles) {
        if (file.bytes) { await writeFile(join(root, file.name), file.bytes); }
        else { await unlink(join(root, file.name)).catch((error: unknown) => {
          if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; }
        }); }
      }
    };
    try {
      await operations.npm(root, ["install", ...specs], { mode: mode.kind, signal: request.signal, onWarning: request.onWarning });
      const after = await snapshotInstallTree(root);
      const installedShared = shared.filter((pin) => after.some((entry) => entry.name === pin.name));
      assertTreePins(before, after, [...pins, ...installedShared], coreNames, mode.coreVersion, initialGlobalLockMissing);
      if (mode.kind === "global" && after.some((entry) => entry.name === "@nodetool-ai/cli")) { throw new Error("Install added another CLI core package"); }
      await assertSharedIdentities(after, installedShared);
      for (const pin of new Map(packs.flatMap((pack) => pack.scriptAllowlist).map((pin) => [pin.name, pin])).values()) {
        if (!before.some((entry) => entry.name === pin.name && entry.version === pin.version && entry.integrity === pin.integrity)) {
          await operations.npm(root, ["rebuild", pin.name], { mode: mode.kind, rebuild: true, signal: request.signal, onWarning: request.onWarning });
        }
      }
      await operations.loadCheck(mode, packs.filter((pack) => pack.kind === "node-pack").map((pack) => pack.id), request.signal);
      await writeState(request.stateFile, desired);
      return desired;
    } catch (cause) {
      let restored = false;
      try {
        const oldPacks = expandCatalogPacks(catalog, installedIds);
        const oldSpecs = [...oldPacks.map((pack) => spec(pack.npm)), ...oldPacks.flatMap((pack) => pack.provides.map((name) => {
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
        await writeState(request.stateFile, { ...previous, dirty: true });
        throw new Error("Pack install failed and rollback did not restore the tree. Run nodetool packs doctor --repair.", { cause });
      }
      throw cause;
    }
  } finally { await release(); }
}
