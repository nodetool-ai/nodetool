import { join } from "node:path";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import { readCatalogIndex, readCatalogNodes, type NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { PackCommandServices, PackDoctorOptions } from "../commands/pack-management.js";
import { installWithCommandAuthorization } from "../commands/authorized-pack-install.js";
import { authorizePackInstallCommand } from "../commands/pack-install-authorization.js";
import { loadCliPackSnapshot } from "./host.js";
import { prepareInstallSelection, type InstallPacksRequest } from "./install-selection.js";
import { readDesiredFor } from "./install-state.js";
import { DEFAULT_INSTALLER_OPERATIONS, installPacks, type InstallerOperations } from "./installer.js";
import { listPackRows, explainPack, requestedInstallIds, restartNotice } from "./management.js";
import { reportPackInstallation } from "./doctor.js";
import { assertPackInstallProcessAllowed } from "./install-process.js";
import { inspectPackInstallLock } from "./doctor-lock.js";
import { readInstalledPacks, type InstalledPackSnapshot } from "./installed.js";
import { readInstallTree, type TreePackage } from "./install-tree.js";
import { projectPins, verifyProjectTree } from "./install-verification.js";
import { currentProject, projectPointerIssue, readProjectSelection } from "./project.js";
import { installerNpmVersion } from "../npm-runner.js";
import { loadInstalledCommandFeature, type WorkflowPackResolver } from "../cli-feature.js";

/** Called only inside a packs command. No entrypoint or module import reads desired state. */
export interface PackCommandServiceOptions {
  readonly snapshot?: InstalledPackSnapshot;
  readonly catalog?: NodeCatalogIndex;
  readonly catalogNodes?: ReturnType<typeof readCatalogNodes>;
  readonly stateFile?: string;
  readonly operations?: InstallerOperations;
  readonly resolveWorkflowPacks?: WorkflowPackResolver;
}

export async function createPackCommandServices(context: PackCommandServiceOptions = {}): Promise<PackCommandServices> {
  const snapshot = context.snapshot ?? await loadCliPackSnapshot();
  const catalog = context.catalog ?? readCatalogIndex();
  const stateFile = context.stateFile ?? join(getNodetoolDataDir(), "cli-packs.json");
  const operations = context.operations;
  const mode = snapshot.mode;
  const managed = mode.kind === "global" || mode.kind === "local" ? mode : null;
  const desired = managed ? await readDesiredFor(stateFile, managed) : undefined;
  const request = (packs: readonly string[], runtimeLibraries: readonly string[] = []): InstallPacksRequest => ({ mode, packs, runtimeLibraries, catalog, stateFile });
  const tree = async (): Promise<readonly TreePackage[]> => snapshot.projectRoot ? readInstallTree(snapshot.projectRoot) : [];
  const runtimeIds = async (): Promise<ReadonlySet<string>> => {
    const installed = await tree();
    const byFolder = new Map((catalog.installPins ?? []).map(pin => [pin.installName ?? pin.name, pin]));
    return new Set(Object.entries(RUNTIME_NPM_PACKAGES).filter(([, runtime]) => runtime.packageNames.every(name => {
      const pin = byFolder.get(name);
      return pin && installed.some(entry => entry.path === `node_modules/${name}` && entry.name === pin.name && entry.version === pin.version && entry.integrity === pin.integrity);
    })).map(([id]) => id));
  };
  return {
    async list() { return listPackRows(catalog, snapshot, await runtimeIds()); },
    async why(target) { return explainPack(catalog, snapshot, target, await runtimeIds()); },
    async add(ids, options) {
      let selected = requestedInstallIds(catalog, ids);
      if (options.restore) {
        const packIds = new Set(catalog.packs.map(pack => pack.id));
        selected = { packs: (desired?.requestedPacks ?? desired?.packs ?? []).filter(id => packIds.has(id)),
          runtimeLibraries: (desired?.runtimeLibraries ?? []).filter(isRuntimeNpmPackageId) };
      } else if (options.for) {
        const resolver = context.resolveWorkflowPacks ?? (await loadInstalledCommandFeature(import.meta.url, "cli-workflow", { snapshot, catalog })).resolveWorkflowPacks;
        if (!resolver) { throw new Error("Configured cli-workflow feature does not provide workflow pack discovery"); }
        const resolved = await resolver(options.for, snapshot, catalog);
        selected = { packs: [...resolved.packs], runtimeLibraries: [...resolved.runtimeLibraries] };

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
      const baseline = { ...reportPackInstallation(snapshot), packsRoot: managed?.packsRoot ?? null, projectRoot: snapshot.projectRoot,
        reason: mode.kind === "global" || mode.kind === "local" ? null : mode.reason,
        installedPacks: snapshot.packs.map(pack => ({ id: pack.id, npm: pack.npm, version: pack.version })),
        desiredCoreVersion: desired?.coreVersion ?? null };
      issues.push(...await inspectPackInstallLock(mode));
      let npmVersion: string | null = null;
      if (managed) {
        try { npmVersion = await (operations?.npmVersion ?? installerNpmVersion)(managed.packsRoot); }
        catch (error) { issues.push({ kind: "npm", message: error instanceof Error ? error.message : String(error) }); }
        const pointer = projectPointerIssue(managed.packsRoot);
        if (pointer) { issues.push({ kind: "project", message: pointer }); }
        try {
          const project = currentProject(managed.packsRoot);
          if (project) {
            const selection = await readProjectSelection(project);
            const current = await prepareInstallSelection(request([], []), "install");
            if (selection.coreVersion !== catalog.coreVersion) { throw new Error(`Pack project records core version ${selection.coreVersion}`); }
            verifyProjectTree(await readInstallTree(project), projectPins(current), catalog.coreVersion);
            const missing = current.packs.filter(pack => !snapshot.packs.some(entry => entry.id === pack.id)).map(pack => pack.id);
            if (missing.length) { throw new Error(`Selected packs are not installed: ${missing.join(", ")}`); }
          }
        } catch (error) { issues.push({ kind: "integrity", message: error instanceof Error ? error.message : String(error) }); }
        if ((options.installed || options.pack?.length) && snapshot.projectRoot) {
          try {
            const ids = options.pack ?? snapshot.packs.map(pack => pack.id);
            await (operations ?? DEFAULT_INSTALLER_OPERATIONS).loadCheck({ cliRoot: mode.cliRoot, projectRoot: snapshot.projectRoot }, ids);
          }
          catch (error) { issues.push({ kind: "registration", message: error instanceof Error ? error.message : String(error) }); }
        }
      }
      if (options.repair) {
        const repairRequest = request([], []);
        const authorization = await authorizePackInstallCommand({ request: repairRequest, command: "packs-repair" });
        if (!authorization) { throw new Error("Node pack repair was not authorized"); }
        const { repairPackInstallation } = await import("./repair.js");
        await repairPackInstallation(repairRequest, authorization, operations);
        process.stderr.write("Node pack installation rebuilt and verified. Restart running serve and MCP processes.\n");
        const repaired = reportPackInstallation(readInstalledPacks(mode, catalog));
        return { ...repaired, npmVersion };
      }
      return { ...baseline, healthy: baseline.healthy && issues.length === 0,
        npmVersion, issues: [...baseline.issues, ...issues] };
    }
  };
}
