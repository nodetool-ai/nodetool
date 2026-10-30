import { Command } from "commander";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { registerSketchCommands } from "./commands/sketch.js";

/** Run the independently installed cli-sketch command group. */
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  initializeCliRuntime(import.meta.url);
  const program = new Command("nodetool");
  registerSketchCommands(program);
  await program.parseAsync([...argv], { from: "user" });
}

export const descriptor = { id: "cli-sketch", apiVersion: 1, requires: [], capabilities: ["cli:sketch"] } as const;
export const feature = { descriptor, run };
export default feature;
