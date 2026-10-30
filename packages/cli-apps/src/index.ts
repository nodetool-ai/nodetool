import { Command } from "commander";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { registerAppCommands } from "./commands/app.js";
import { registerAppsCommands } from "./commands/apps.js";

/** Run the independently installed cli-apps command group. */
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  initializeCliRuntime(import.meta.url);
  const program = new Command("nodetool");
  registerAppCommands(program);
  registerAppsCommands(program);
  await program.parseAsync([...argv], { from: "user" });
}

export const descriptor = { id: "cli-apps", apiVersion: 1, requires: [], capabilities: ["cli:apps"] } as const;
export const feature = { descriptor, run };
export default feature;
