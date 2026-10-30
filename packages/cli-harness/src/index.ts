import { Command } from "commander";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { configureCliPackHost } from "@nodetool-ai/pack-manager/packs/host";
import { registerHarnessCommands } from "./commands/harness.js";
import { registerAffectedCommand } from "./commands/affected.js";
import { registerEvalCommand } from "./commands/eval.js";
import { registerJtbdCommand } from "./commands/jtbd.js";
import { registerReliabilityCommands } from "./commands/reliability.js";

/** Construct only the installed harness and evaluation command family. */
export function createProgram(): Command {
  const program = new Command().name("nodetool").description("NodeTool harness and evaluation commands")
    .option("--api-url <url>", "NodeTool API URL")
    .option("--token <token>", "NodeTool API bearer token");
  registerHarnessCommands(program);
  registerAffectedCommand(program);
  registerEvalCommand(program);
  registerJtbdCommand(program, async () => {
    const { setupCliDb } = await import("@nodetool-ai/cli-local/local-db");
    await setupCliDb();
  });
  registerReliabilityCommands(program);
  return program;
}

/** Run the explicitly selected harness command family. */
export async function run(argv: readonly string[]): Promise<void> {
  initializeCliRuntime(import.meta.url);
  configureCliPackHost(import.meta.url);
  await createProgram().parseAsync([...argv], { from: "user" });
}

export const descriptor = { id: "cli-harness", apiVersion: 1, requires: [], capabilities: ["cli:harness"] } as const;
export const feature = { descriptor, run };
export default feature;
