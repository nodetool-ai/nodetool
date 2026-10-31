import type { Command } from "commander";
import { registerPackManagementCommands, type PackCommandServices } from "./pack-management.js";
import { configureCliPackHost } from "../packs/host.js";
import { createPackCommandServices } from "../packs/command-service.js";

/** Register management without importing any execution or compiler feature. */
export function registerPackCommands(program: Command, entryUrl?: string, loadServices: () => Promise<PackCommandServices> = createPackCommandServices): void {
  if (entryUrl) { configureCliPackHost(entryUrl); }
  const packs = program.command("packs").description("Manage explicitly installed packs and CLI features");
  registerPackManagementCommands(packs, loadServices);
}
