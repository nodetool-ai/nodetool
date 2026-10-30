import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { closePythonProviders } from "@nodetool-ai/cli-providers";
import { registerAgentCommands } from "./commands/agent.js";
import { registerAuthoringCommands } from "./commands/tools.js";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { configureCliPackHost } from "@nodetool-ai/cli-execution/packs/host";

export function createProgram(): Command {
  const program = new Command().name("nodetool");
  program.command("chat").description("Start interactive chat (chat --help for options)");
  registerAgentCommands(program);
  registerAuthoringCommands(program);
  return program;
}

export async function run(argv: readonly string[]): Promise<void> {
  initializeCliRuntime(import.meta.url);
  configureCliPackHost(import.meta.resolve("@nodetool-ai/cli"));
  if (argv[0] === "chat") {
    const entry = new URL(import.meta.url.endsWith(".ts") ? "./chat-entry.ts" : "./chat-entry.js", import.meta.url);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(entry), ...argv.slice(1)], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        process.exitCode = code ?? (signal ? 1 : 0);
        resolve();
      });
    });
    return;
  }
  try {
    await createProgram().parseAsync([...argv], { from: "user" });
  } finally {
    await closePythonProviders();
  }
}

export const feature = { descriptor: { id: "cli-chat", apiVersion: 1, requires: [], capabilities: ["cli:chat", "cli:agent", "cli:tools"] }, run };
export default feature;
