import { Command } from "commander";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { registerJsScriptCommands } from "./commands/js-script.js";

/** Run the independently installed cli-script command group. */
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  initializeCliRuntime(import.meta.url);
  const program = new Command("nodetool");
  registerJsScriptCommands(program);
  await program.parseAsync([...argv], { from: "user" });
}

export const descriptor = { id: "cli-script", apiVersion: 1, requires: [], capabilities: ["cli:script"] } as const;
export const feature = { descriptor, run };
export default feature;
