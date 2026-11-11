/**
 * `nodetool runtime python-packs list | add | update | remove`: the Python
 * node packs (nodetool-huggingface and friends) in the Python runtime, with
 * the install policy the desktop Package Manager uses.
 */
import type { Command } from "commander";
import {
  installPythonPack,
  listInstalledPythonPacks,
  uninstallPythonPack,
  updatePythonPack,
  type PythonPackResult,
  type RuntimeInstallHost
} from "@nodetool-ai/runtime-install";

import { asJson, printTable } from "@nodetool-ai/cli-common/commands/output";
import { cliRuntimeHost } from "./runtime-managed.js";

/** `nodetool-huggingface` and `nodetool-ai/nodetool-huggingface` name the same pack. */
export function pythonPackRepoId(input: string): string {
  const trimmed = input.trim();
  return trimmed.includes("/") ? trimmed : `nodetool-ai/${trimmed}`;
}

type PackOperation = (host: RuntimeInstallHost, repoId: string) => Promise<PythonPackResult>;

/** The pack operations the commands run, replaceable for a host or a test. */
export interface PythonPackOperations {
  readonly list: typeof listInstalledPythonPacks;
  readonly install: PackOperation;
  readonly update: PackOperation;
  readonly remove: PackOperation;
}

const RUNTIME_INSTALL_OPERATIONS: PythonPackOperations = {
  list: listInstalledPythonPacks,
  install: installPythonPack,
  update: updatePythonPack,
  remove: uninstallPythonPack
};

async function runEach(repos: readonly string[], operation: PackOperation): Promise<void> {
  const failures: string[] = [];
  for (const repo of repos) {
    const repoId = pythonPackRepoId(repo);
    const result = await operation(cliRuntimeHost(), repoId);
    console.error(result.message);
    if (!result.success) {
      failures.push(repoId);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Failed: ${failures.join(", ")}`);
  }
}

export function registerPythonPackCommands(
  runtime: Command,
  operations: PythonPackOperations = RUNTIME_INSTALL_OPERATIONS
): void {
  const packs = runtime
    .command("python-packs")
    .description("Install Python node packs into the Python runtime. Installs Python first when it is missing.");

  packs
    .command("list")
    .description("List the installed Python node packs")
    .option("--json", "Print JSON")
    .action(async (options: { json?: boolean }) => {
      const installed = await operations.list(cliRuntimeHost());
      if (options.json) {
        asJson({ packs: installed });
        return;
      }
      if (installed.length === 0) {
        console.log("No Python node packs are installed.");
        return;
      }
      printTable(installed.map((pack) => ({ ...pack })), ["name", "version", "repo_id"]);
    });

  packs
    .command("add")
    .description("Install the newest release of each pack")
    .argument("<packs...>", "Pack names or repo ids, such as nodetool-huggingface")
    .action((repos: string[]) => runEach(repos, operations.install));

  packs
    .command("update")
    .description("Reinstall each pack at its newest release")
    .argument("<packs...>", "Pack names or repo ids")
    .action((repos: string[]) => runEach(repos, operations.update));

  packs
    .command("remove")
    .description("Uninstall each pack")
    .argument("<packs...>", "Pack names or repo ids")
    .action((repos: string[]) => runEach(repos, operations.remove));
}
