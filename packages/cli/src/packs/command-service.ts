import { spawn } from "node:child_process";
import { join } from "node:path";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import { readCatalogIndex, readCatalogNodes, type NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { PackCommandServices, PackDoctorOptions } from "../commands/pack-management.js";
import { installWithCommandAuthorization } from "../commands/authorized-pack-install.js";
import { authorizePackInstallCommand } from "../commands/pack-install-authorization.js";
import { loadCliPackSnapshot } from "./host.js";
import { readDesiredState, type InstallPacksRequest } from "./install-selection.js";
import { installPacks, type InstallerOperations } from "./installer.js";
import { listPackRows, explainPack, requestedInstallIds, restartNotice } from "./management.js";
import { reportPackInstallation } from "./doctor.js";
import { assertPackInstallProcessAllowed } from "./install-process.js";
import { inspectPackInstallLock } from "./doctor-lock.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { readInstallTree, assertTreePins, assertSharedIdentities, type TreePackage } from "./install-tree.js";
import { installerNpmVersion } from "../npm-runner.js";

async function verifyInstalledInChild(cliRoot: string, installRoot: string, ids: readonly string[]): Promise<void> {
  const entry = fileURLToPath(new URL("./installer-load-check.js", import.meta.url));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [entry, cliRoot, installRoot, ...ids], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => { if (code === 0) { resolve(); } else { reject(new Error(`Installed pack registration failed (${String(code)}): ${output.trim()}`)); } });
  });
}

/** Called only inside a packs command. No entrypoint or module import reads desired state. */
export interface PackCommandServiceOptions {
  readonly snapshot?: InstalledPackSnapshot;
  readonly catalog?: NodeCatalogIndex;
  readonly catalogNodes?: ReturnType<typeof readCatalogNodes>;
  readonly stateFile?: string;
  readonly operations?: InstallerOperations;
}

export async function createPackCommandServices(context: PackCommandServiceOptions = {}): Promise<PackCommandServices> {
  const snapshot = context.snapshot ?? await loadCliPackSnapshot();
  const catalog = context.catalog ?? readCatalogIndex();
  const stateFile = context.stateFile ?? join(getNodetoolDataDir(), "cli-packs.json");
  const operations = context.operations;
  const root = snapshot.mode.kind === "global" || snapshot.mode.kind === "local" ? await realpath(snapshot.mode.installRoot) : null;
  const state = await readDesiredState(stateFile);
  const desired = root ? state[root] : undefined;
  const request = (packs: readonly string[], runtimeLibraries: readonly string[] = []): InstallPacksRequest => ({ mode: snapshot.mode, packs, runtimeLibraries, catalog, stateFile });
  const tree = async (): Promise<readonly TreePackage[]> => root ? (await readInstallTree(root, snapshot.mode.kind === "global")).packages : [];
  const runtimeIds = async (): Promise<ReadonlySet<string>> => {
    const installed = await tree();
    const byFolder = new Map((catalog.installPins ?? []).map(pin => [pin.installName ?? pin.name, pin]));
    return new Set(Object.entries(RUNTIME_NPM_PACKAGES).filter(([, runtime]) => runtime.packageNames.every(name => {
      const pin = byFolder.get(name);
      return pin && installed.some(entry => entry.name === pin.name && entry.version === pin.version && entry.integrity === pin.integrity);
    })).map(([id]) => id));
  };
  return {
    async list() { return listPackRows(catalog, snapshot, await runtimeIds()); },
    async why(target) { return explainPack(catalog, snapshot, target, await runtimeIds()); },
    async add(ids, options) {
      let selected = requestedInstallIds(catalog, ids);
      if (options.restore) {
        selected = { packs: desired?.packs ?? [], runtimeLibraries: desired?.runtimeLibraries ?? [] };
      } else if (options.for) {
        const { resolveTarget } = await import("../debug/target.js");
        const { findMissingPacks } = await import("@nodetool-ai/execution");
        const { NodeRegistry } = await import("@nodetool-ai/node-sdk");
        let db: Promise<typeof import("@nodetool-ai/models")> | undefined;
        const load = async (id: string) => {
          db ??= import("@nodetool-ai/models").then(async models => {
            const { getDefaultDbPath } = await import("@nodetool-ai/config");
            models.initDb(getDefaultDbPath());
            return models;
          });
          return (await db).Workflow.find("1", id);
        };
        const resolved = await resolveTarget(options.for, load);
        const registry = new NodeRegistry();
        const installed = new Set(snapshot.packs.map(pack => pack.id));
        registry.loadCatalog(context.catalogNodes ?? readCatalogNodes(), catalog.packs);
        const missing = await findMissingPacks(resolved.graph, registry, { catalog, installedPackIds: installed, loadWorkflow: load });
        const libraries = await runtimeIds();
        selected = { packs: missing?.packs.map(pack => pack.id).filter(id => !installed.has(id)) ?? [],
          runtimeLibraries: missing ? missing.runtimeLibraries.filter(id => isRuntimeNpmPackageId(id) && !libraries.has(id)) : [] };
      }
      if (selected.packs.length === 0 && selected.runtimeLibraries.length === 0) {
        console.log("No missing node packs or runtime libraries to install.");
        return;
      }
      assertPackInstallProcessAllowed();
      const installRequest = request(selected.packs, selected.runtimeLibraries);
      const installed = await installWithCommandAuthorization({
        authorize: () => authorizePackInstallCommand({ request: installRequest,
          command: options.restore ? "packs-restore" : "packs-add", confirm: !options.yes }),
        install: authorization => installPacks(installRequest, authorization, operations)
      });
      if (!installed) { return; }
      process.stderr.write(restartNotice([...selected.packs, ...selected.runtimeLibraries]) + "\n");
    },
    async remove(ids) {
      const selected = requestedInstallIds(catalog, ids);
      const removeRequest = request(selected.packs, selected.runtimeLibraries);
      const authorization = await authorizePackInstallCommand({ request: removeRequest, command: "packs-remove" });
      if (!authorization) { throw new Error("Node pack removal was not authorized"); }
      const { removePacks } = await import("./removal.js");
      const result = await removePacks(removeRequest, authorization, operations);
      if (result.kept.length) { console.log(`Keeping required packages: ${result.kept.join(", ")}`); }
      console.log(result.removed.length ? `Removed: ${result.removed.join(", ")}` : "No installed packages were removed.");
      process.stderr.write('Running "nodetool serve" and "nodetool mcp serve" processes may fail on later lazy imports. Restart them after removing packs.\n');
    },
    async doctor(options: PackDoctorOptions) {
      const issues: Array<{ kind: string; message: string }> = [];
      const baseline = { ...reportPackInstallation(snapshot), installRoot: root,
        reason: snapshot.mode.kind === "global" || snapshot.mode.kind === "local" ? null : snapshot.mode.reason,
        installedPacks: snapshot.packs.map(pack => ({ id: pack.id, npm: pack.npm, version: pack.version })),
        desiredCoreVersion: desired?.coreVersion ?? null };
      issues.push(...await inspectPackInstallLock(snapshot.mode));
      let npmVersion: string | null = null;
      if (root) {
        try { npmVersion = await (operations?.npmVersion ?? installerNpmVersion)(root); }
        catch (error) { issues.push({ kind: "npm", message: error instanceof Error ? error.message : String(error) }); }
        try {
          const installed = await tree();
          const admitted = new Set(snapshot.packs.map(pack => pack.npm));
          const names = new Set(installed.map(entry => entry.name));
          const pins = [...catalog.packs.filter(pack => admitted.has(pack.npm.name)).map(pack => pack.npm), ...(catalog.installPins ?? []).filter(pin => names.has(pin.name))];
          const coreNames = new Set(catalog.packs.filter(pack => pack.kind === "core").map(pack => pack.npm.name));
          assertTreePins(installed, installed, pins, coreNames, catalog.coreVersion);
          await assertSharedIdentities(installed, (catalog.installPins ?? []).filter(pin => pin.shared));
        } catch (error) { issues.push({ kind: "integrity", message: error instanceof Error ? error.message : String(error) }); }
        if (options.installed || options.pack?.length) {
          try {
            const ids = options.pack ?? snapshot.packs.map(pack => pack.id);
            if (operations) { await operations.loadCheck(snapshot.mode, ids); }
            else { await verifyInstalledInChild(snapshot.mode.cliRoot, root, ids); }
          }
          catch (error) { issues.push({ kind: "registration", message: error instanceof Error ? error.message : String(error) }); }
        }
      }
      if (options.repair) {
        const repairRequest = request(desired?.packs ?? [], desired?.runtimeLibraries ?? []);
        const authorization = await authorizePackInstallCommand({ request: repairRequest, command: "packs-repair" });
        if (!authorization) { throw new Error("Node pack repair was not authorized"); }
        const { repairPackInstallation } = await import("./repair.js");
        await repairPackInstallation(repairRequest, authorization, operations);
        process.stderr.write("Node pack installation verified and repaired. Restart running serve and MCP processes.\n");
        const repaired = reportPackInstallation(readInstalledPacks(snapshot.mode, catalog));
        return { ...repaired, npmVersion, dirty: false };
      }
      return { ...baseline, healthy: baseline.healthy && issues.length === 0 && !desired?.dirty,
        npmVersion, dirty: desired?.dirty ?? false, issues: [...baseline.issues, ...issues] };
    }
  };
}
