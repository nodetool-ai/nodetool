import { Command } from "commander";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Start the classic HTTP/WebSocket server with the installed pack source. */
export function createProgram(): Command {
  const program = new Command("nodetool");
  program.command("serve").description("Start the classic NodeTool HTTP and WebSocket server").option("--host <host>", "Host to bind", "127.0.0.1").option("--port <port>", "Port to listen on", "7777").action(async (flags: { host: string; port: string }) => {
    const { refusePackInstallsInProcess } = await import("@nodetool-ai/pack-manager/packs/install-process");
    refusePackInstallsInProcess("serve");
    const target = new URL(import.meta.url.endsWith(".ts") ? "./packs/serve.ts" : "./packs/serve.js", import.meta.url);
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(target)], { stdio: "inherit", env: { ...process.env, HOST: flags.host, PORT: flags.port } });
    const interrupt = (): void => { child.kill("SIGINT"); };
    const terminate = (): void => { child.kill("SIGTERM"); };
    process.once("SIGINT", interrupt); process.once("SIGTERM", terminate);
    try {
      process.exitCode = await new Promise<number>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1)));
      });
    } finally { process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", terminate); }
  });
  return program;
}
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> { await createProgram().parseAsync([...argv], { from: "user" }); }
export const feature = { descriptor: { id: "cli-server", apiVersion: 1, requires: [], capabilities: ["cli:server"] }, run };
