import type { Command } from "commander";
import { printCommandError } from "../command-errors.js";
import { printTable } from "./output.js";
import type { PackListRow } from "../packs/management.js";

export interface NodesAddOptions { readonly yes?: boolean; readonly restore?: boolean; readonly for?: string }
export interface NodesDoctorOptions { readonly installed?: boolean; readonly json?: boolean; readonly repair?: boolean; readonly pack?: string[] }
export interface NodeCommandServices {
  list(): Promise<readonly PackListRow[]>;
  add(ids: readonly string[], options: NodesAddOptions): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
  doctor(options: NodesDoctorOptions): Promise<{ readonly healthy: boolean; readonly [key: string]: unknown }>;
  why(target: string): Promise<Record<string, unknown>>;
}

/** Register the command shape without reading the installed tree or constructing an installer. */
export function registerNodesCommands(program: Command, loadServices: () => Promise<NodeCommandServices>): void {
  const nodes = program.command("nodes").description("Manage installed node packs and runtime libraries");
  nodes.command("list").description("List available and installed node packs and runtime libraries")
    .option("--json", "Print the installed catalog report as JSON")
    .action(async (options: { json?: boolean }) => {
      try {
        const rows = await (await loadServices()).list();
        if (options.json) { console.log(JSON.stringify(rows, null, 2)); }
        else { printTable(rows.map(row => ({ id: row.id, kind: row.kind, installed: row.installed, version: row.version,
          bytes: row.installBytes, nodes: row.nodeCount, required_by: row.requiredBy.join(", ") }))); }
      } catch (error) { process.exitCode = printCommandError(error, options.json); }
    });
  nodes.command("add [ids...]").description("Install node packs or runtime libraries and their requirements")
    .option("--yes", "Confirm the install without prompting")
    .option("--restore", "Restore the desired set recorded for this install root")
    .option("--for <workflow|file>", "Install every pack needed by a saved workflow or an explicitly named local workflow file")
    .action(async (ids: string[], options: NodesAddOptions) => {
      try {
        const selections = Number(ids.length > 0) + Number(Boolean(options.restore)) + Number(Boolean(options.for));
        if (selections !== 1) { throw new Error("Choose pack ids, --restore, or --for <workflow|file>"); }
        await (await loadServices()).add(ids, options);
      } catch (error) { process.exitCode = printCommandError(error); }
    });
  nodes.command("remove <ids...>").description("Remove node packs while retaining requirements of installed packs")
    .action(async (ids: string[]) => {
      try { await (await loadServices()).remove(ids); }
      catch (error) { process.exitCode = printCommandError(error); }
    });
  nodes.command("doctor").description("Check the install mode, versions, integrity, shared copies and registration")
    .option("--json", "Print the diagnostic report as JSON")
    .option("--installed", "Register installed packs in a fresh child process")
    .option("--pack <ids...>", "Limit registration checks to these pack ids")
    .option("--repair", "Verify and repair a dirty pack installation")
    .action(async (options: NodesDoctorOptions) => {
      try {
        const report = await (await loadServices()).doctor(options);
        console.log(JSON.stringify(report, null, 2));
        if (!report.healthy) { process.exitCode = 1; }
      } catch (error) { process.exitCode = printCommandError(error, options.json); }
    });
  nodes.command("why <node_type|id>").description("Explain a node owner, pack requirements or runtime library")
    .action(async (target: string) => {
      try { console.log(JSON.stringify(await (await loadServices()).why(target), null, 2)); }
      catch (error) { process.exitCode = printCommandError(error); }
    });
}
