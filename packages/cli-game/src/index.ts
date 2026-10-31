import { Command } from "commander";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { registerGameCommands } from "./commands/game.js";

/** Run the independently installed cli-game command group. */
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  initializeCliRuntime(import.meta.url);
  const program = new Command("nodetool");
  registerGameCommands(program);
  await program.parseAsync([...argv], { from: "user" });
}

export const descriptor = { id: "cli-game", apiVersion: 1, requires: [], capabilities: ["cli:game"] } as const;
export const feature = { descriptor, run };
export default feature;
