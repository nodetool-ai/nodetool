import { Command } from "commander";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { registerTimelineCommands } from "./commands/timeline.js";

/** Run the independently installed cli-timeline command group. */
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  initializeCliRuntime(import.meta.url);
  const program = new Command("nodetool");
  registerTimelineCommands(program);
  await program.parseAsync([...argv], { from: "user" });
}

export const descriptor = { id: "cli-timeline", apiVersion: 1, requires: [], capabilities: ["cli:timeline"] } as const;
export const feature = { descriptor, run };
export default feature;
