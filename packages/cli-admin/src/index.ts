import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerDbCommands } from "./commands/db.js";
import { registerDeployCommands } from "./commands/deploy.js";
import { registerWorkerCommands } from "./commands/worker.js";
import { registerPackageCommands } from "./commands/package.js";
import { registerRuntimeCommands } from "./commands/runtime.js";
import { registerExtensionCommands } from "./commands/extension.js";
import { registerTelemetryCommands } from "./commands/telemetry.js";
import { registerTelegramCommands } from "./commands/telegram.js";
import { registerPackCommands } from "./commands/packs.js";
import { initializeExecutionHost } from "./execution-host.js";

export { initializeExecutionHost } from "./execution-host.js";

/** Register independently installed deployment and maintenance commands. */
export function createProgram(): Command {
  const program = new Command("nodetool");
  registerAuthCommands(program);
  registerDbCommands(program);
  registerDeployCommands(program);
  registerWorkerCommands(program);
  registerPackageCommands(program);
  registerRuntimeCommands(program);
  registerExtensionCommands(program);
  registerTelemetryCommands(program);
  registerTelegramCommands(program);
  registerPackCommands(program);
  program.command("storage").command("migrate-keys").option("--dry-run").option("--user-id <id>").option("--json").action(async (flags: { dryRun?: boolean; userId?: string; json?: boolean }) => {
    const { setupCliDb } = await import("@nodetool-ai/cli-local/local-db");
    await setupCliDb();
    const { migrateStorageKeys, formatMigrateKeysReport } = await import("./commands/storage.js");
    const report = await migrateStorageKeys(flags);
    process.stdout.write(`${flags.json ? JSON.stringify(report, null, 2) : formatMigrateKeysReport(report, Boolean(flags.dryRun))}\n`);
    if (report.failed > 0) { process.exitCode = 1; }
  });
  const registerCodeMigration = (command: Command): void => { command.option("--dry-run").option("--user-id <id>").option("--json").action(async (flags: { dryRun?: boolean; userId?: string; json?: boolean }) => {
    const { setupCliDb } = await import("@nodetool-ai/cli-local/local-db");
    await setupCliDb();
    const { migrateCodeInputs, formatMigrateCodeInputsReport } = await import("./commands/migrate-code-inputs.js");
    const report = await migrateCodeInputs(flags);
    process.stdout.write(`${flags.json ? JSON.stringify(report, null, 2) : formatMigrateCodeInputsReport(report, Boolean(flags.dryRun))}\n`);
    if (report.failed > 0) { process.exitCode = 1; }
  }); };
  registerCodeMigration(program.command("migrate-code-inputs"));
  registerCodeMigration(program.command("workflows").command("migrate-code-inputs"));
  return program;
}
export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const { initializeCliRuntime } = await import("@nodetool-ai/cli-common/runtime-env");
  initializeCliRuntime(import.meta.url);
  await createProgram().parseAsync([...argv], { from: "user" });
}
export const feature = { descriptor: { id: "cli-admin", apiVersion: 1, requires: [], capabilities: ["cli:admin"] }, run, initializeExecutionHost };
