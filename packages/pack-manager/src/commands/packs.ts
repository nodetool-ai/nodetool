import type { Command } from "commander";
import { registerPackManagementCommands, type PackCommandServices } from "./pack-management.js";
import { configureCliPackHost } from "../packs/host.js";
import { createPackCommandServices } from "../packs/command-service.js";

/** Register management without importing any execution or compiler feature. */
export function registerPackCommands(program: Command, entryUrl?: string, loadServices: () => Promise<PackCommandServices> = createPackCommandServices): void {
  if (entryUrl) { configureCliPackHost(entryUrl); }
  const packs = program.command("packs").description("Manage explicitly installed packs and CLI features");
  registerPackManagementCommands(packs, loadServices);
  const presets = packs.command("presets").description("Manage data-only preset packs");
  presets.command("add <directory>").action(async (directory: string) => {
    const { installPresetPack } = await import("../preset-packs.js");
    installPresetPack(directory);
  });
  presets.command("list").action(async () => {
    const { readPresetPacks } = await import("@nodetool-ai/pack-core/preset-catalog");
    process.stdout.write(JSON.stringify(readPresetPacks().map(pack => pack.manifest), null, 2) + "\n");
  });
  presets.command("remove <id>").action(async (id: string) => {
    const { removePresetPack } = await import("../preset-packs.js");
    removePresetPack(id);
  });
}
