import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { getNodetoolDataDir } from "@nodetool-ai/config";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import { isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import { commandMissingPack, commandMissingRuntime } from "../command-errors.js";
import { childExitCode } from "../child-exit.js";
import { loadCliPackSnapshot } from "../packs/host.js";
import { installPacks } from "../packs/installer.js";
import { restartNotice } from "../packs/management.js";
import { installWithCommandAuthorization } from "./authorized-pack-install.js";
import { authorizePackInstallCommand } from "./pack-install-authorization.js";

export type PackRunCommand = "run" | "debug" | "node-run" | "workflows-run";

/** An authorized run installs once, then delegates the original command to a fresh process. */
export async function installMissingPacksAndReexec(value: unknown, options: {
  readonly command: PackRunCommand;
  readonly installMissing?: boolean;
  readonly prompt?: Parameters<typeof authorizePackInstallCommand>[0]["prompt"];
  readonly stateFile?: string;
  readonly catalog?: NodeCatalogIndex;
}, dependencies: {
  readonly snapshot?: typeof loadCliPackSnapshot;
  readonly authorize?: typeof authorizePackInstallCommand;
  readonly install?: typeof installPacks;
  readonly spawn?: typeof spawnSync;
  readonly write?: (message: string) => void;
} = {}): Promise<number | null> {
  const missing = commandMissingPack(value);
  const runtime = commandMissingRuntime(value)?.runtimePackage;
  const runtimeLibraries = [...new Set([...(missing?.runtimeLibraries ?? []).filter(isRuntimeNpmPackageId),
    ...(runtime && isRuntimeNpmPackageId(runtime) ? [runtime] : [])])];
  if ((!missing && !runtimeLibraries.length) || process.env["NODETOOL_PACKS_REEXEC"] === "1" || process.env["NODETOOL_PACKS_INSTALLER"] !== "1") {
    return null;
  }
  const snapshot = await (dependencies.snapshot ?? loadCliPackSnapshot)();
  if (snapshot.mode.kind !== "global" && snapshot.mode.kind !== "local") {
    return null;
  }
  const request = {
    mode: snapshot.mode,
    packs: missing?.packs.map(pack => pack.id) ?? [],
    runtimeLibraries,
    stateFile: options.stateFile ?? join(getNodetoolDataDir(), "cli-packs.json"),
    catalog: options.catalog
  };
  const installed = await installWithCommandAuthorization({
    authorize: () => (dependencies.authorize ?? authorizePackInstallCommand)({
      request, command: options.command, installMissing: options.installMissing, prompt: options.prompt
    }),
    install: authorization => (dependencies.install ?? installPacks)(request, authorization)
  });
  if (!installed) { return null; }
  const write = dependencies.write ?? ((message: string) => { process.stderr.write(message + "\n"); });
  write(restartNotice([...request.packs, ...request.runtimeLibraries]));
  const child = (dependencies.spawn ?? spawnSync)(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    shell: false, stdio: "inherit", env: { ...process.env, NODETOOL_PACKS_REEXEC: "1" }
  });
  return childExitCode(child);
}
