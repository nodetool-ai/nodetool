import { readFile, writeFile, rename, mkdir, realpath, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { readCatalogIndex, type NodeCatalogIndex, type CatalogPack } from "@nodetool-ai/node-catalog";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import { acquireInstallLock } from "../install-lock.js";
import { installerNpmVersion, runInstallerNpm } from "../npm-runner.js";
import type { InstallMode } from "./mode.js";
import { snapshotInstallTree, parseInstallPlan, assertAdditivePlan, assertTreePins, assertSharedIdentities, removeSnapshotAdditions, type VerificationPin } from "./install-tree.js";

const desiredSchema = z.object({ root: z.string(), coreVersion: z.string(), packs: z.array(z.string()),
  runtimeLibraries: z.array(z.string()), dirty: z.boolean().optional() });
const stateSchema = z.record(z.string(), desiredSchema);
export type DesiredPackState = z.infer<typeof desiredSchema>;
export interface InstallPacksRequest {
  readonly mode: InstallMode;
  readonly packs: readonly string[];
  readonly runtimeLibraries?: readonly string[];
  /** A21 supplies this only after explicit user install authorization. */
  readonly authorized: boolean;
  readonly stateFile: string;
  readonly catalog?: NodeCatalogIndex;
  readonly signal?: AbortSignal;
}
export interface InstallerOperations {
  readonly npmVersion: typeof installerNpmVersion;
  readonly npm: typeof runInstallerNpm;
  readonly loadCheck: (mode: InstallMode, packs: readonly string[], signal?: AbortSignal) => Promise<void>;
}

async function readState(file: string): Promise<z.infer<typeof stateSchema>> {
  try { return stateSchema.parse(JSON.parse(await readFile(file, "utf8"))); }
  catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") { return {}; }
    throw error;
  }
}
async function writeState(file: string, value: DesiredPackState): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const release = await acquireInstallLock(dirname(file), ".cli-packs-state.lock");
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const state = await readState(file);
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

function expand(catalog: NodeCatalogIndex, ids: readonly string[]): CatalogPack[] {
  const byId = new Map(catalog.packs.map((pack) => [pack.id, pack]));
  const visited = new Set<string>();
  const pending = [...ids];
  const result: CatalogPack[] = [];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) { continue; }
    visited.add(id);
    const pack = byId.get(id);
    if (!pack) { throw new Error(`Unknown node pack: ${id}`); }
    result.push(pack); pending.push(...pack.requires);
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

/** Additive install transaction. No command can enable it without both flag and authorization. */
export async function installPacks(request: InstallPacksRequest, operations: InstallerOperations = {
  npmVersion: installerNpmVersion, npm: runInstallerNpm, loadCheck: childLoadCheck
}): Promise<DesiredPackState> {
  if (process.env["NODETOOL_PACKS_INSTALLER"] !== "1") { throw new Error("Node pack installer is disabled. Set NODETOOL_PACKS_INSTALLER=1 to enable the preview."); }
  const { mode } = request;
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  if (!request.authorized) { throw new Error("Installing node packs requires explicit authorization, including local package.json and lockfile updates."); }
  const version = await operations.npmVersion(mode.installRoot, request.signal);
  const catalog = request.catalog ?? readCatalogIndex();
  if (catalog.coreVersion !== mode.coreVersion) { throw new Error("Catalog and CLI versions differ"); }
  const root = await realpath(mode.installRoot);
  const release = await acquireInstallLock(mode.nodeModulesRoot, ".nodetool-packs.lock", { signal: request.signal });
  try {
    const state = await readState(request.stateFile);
    const previous = state[root] ?? { root, coreVersion: mode.coreVersion, packs: [], runtimeLibraries: [] };
    if (previous.dirty) { throw new Error("Pack installation is dirty. Run nodetool packs doctor --repair."); }
    const before = await snapshotInstallTree(root);
    const installedIds = catalog.packs.filter((pack) => pack.kind === "node-pack" && before.some((entry) => entry.name === pack.npm.name)).map((pack) => pack.id);
    const packs = expand(catalog, [...previous.packs, ...installedIds, ...request.packs]);
    const libraries = [...new Set([...previous.runtimeLibraries, ...(request.runtimeLibraries ?? []), ...packs.flatMap((pack) => pack.runtimeLibraries)])].sort();
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
    assertTreePins(before, before, pins.filter((pin) => before.some((entry) => entry.name === pin.name)), coreNames, mode.coreVersion);
    const spec = (pin: VerificationPin): string => pin.installName && pin.installName !== pin.name
      ? `${pin.installName}@npm:${pin.name}@${pin.version}` : `${pin.name}@${pin.version}`;
    const specs = [...new Set([...packs.map((pack) => spec(pack.npm)), ...runtimePins.map(spec)])];
    const plan = parseInstallPlan(await operations.npm(root, ["install", ...specs, ...(Number(version.split(".")[0]) >= 11 ? ["--json"] : [])], { mode: mode.kind, dryRun: true, signal: request.signal }), version);
    assertAdditivePlan(plan, before, coreNames, shared, mode.coreVersion);
    const desired: DesiredPackState = { root, coreVersion: mode.coreVersion, packs: packs.filter((pack) => pack.kind === "node-pack").map((pack) => pack.id), runtimeLibraries: libraries };
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
      await operations.npm(root, ["install", ...specs], { mode: mode.kind, signal: request.signal });
      const after = await snapshotInstallTree(root);
      const installedShared = shared.filter((pin) => after.some((entry) => entry.name === pin.name));
      assertTreePins(before, after, [...pins, ...installedShared], coreNames, mode.coreVersion);
      if (mode.kind === "global" && after.some((entry) => entry.name === "@nodetool-ai/cli")) { throw new Error("Install added another CLI core package"); }
      await assertSharedIdentities(after, installedShared);
      for (const pin of new Map(packs.flatMap((pack) => pack.scriptAllowlist).map((pin) => [pin.name, pin])).values()) {
        if (!before.some((entry) => entry.name === pin.name && entry.version === pin.version && entry.integrity === pin.integrity)) {
          await operations.npm(root, ["rebuild", pin.name], { mode: mode.kind, rebuild: true, signal: request.signal });
        }
      }
      await operations.loadCheck(mode, desired.packs, request.signal);
      await writeState(request.stateFile, desired);
      return desired;
    } catch (cause) {
      let restored = false;
      try {
        const oldPacks = expand(catalog, [...previous.packs, ...installedIds]);
        const oldSpecs = [...oldPacks.map((pack) => spec(pack.npm)), ...previous.runtimeLibraries.flatMap((id) => libraryPins(id).map(spec))];
        const oldNames = new Set(before.map((entry) => entry.name));
        const additions = [...new Set(plan.add.filter((entry) => !oldNames.has(entry.name)).map((entry) => entry.name))];
        // npm uninstall --no-save retains extraneous no-save additions. The
        // saving removal is confined to rollback and manifests are restored below.
        if (additions.length) { await operations.npm(root, ["uninstall", ...additions], { mode: "local" }); }
        if (mode.kind === "global") {
          await removeSnapshotAdditions(root, mode.nodeModulesRoot, before);
          await restoreSavedFiles();
          await operations.npm(root, ["install", ...oldSpecs], { mode: mode.kind });
        }
        restored = JSON.stringify(await snapshotInstallTree(root)) === JSON.stringify(before);
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
