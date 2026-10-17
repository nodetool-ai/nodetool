/** Direct local access to the same tools and guides as CLI agent sessions. */
import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import type { Tool } from "@nodetool-ai/agents";
import { asJson } from "./output.js";
import {
  commandFailureExitCode,
  printCommandError
} from "../command-errors.js";
import { isRecord } from "../predicates.js";
import { setupLocalDb, LOCAL_USER_ID } from "./local-db.js";

export interface AuthoringTools {
  list(): Promise<Tool[]>;
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
}

async function localTools(): Promise<AuthoringTools> {
  const { buildCliToolbelt } = await import("../agent-toolbelt.js");
  const { buildFullRegistry } = await import("../node-registry.js");
  const registry = await buildFullRegistry();
  const tools = buildCliToolbelt({}, registry);
  return {
    list: async () => tools,
    call: async (name, args) => {
      if (!tools.some((candidate) => candidate.name === name)) {
        throw new Error(
          `Unknown tool: ${name}. Use nodetool tools list to discover names.`
        );
      }
      const { getDefaultDbPath } = await import("@nodetool-ai/config");
      const { migrateSqliteDb, Project } = await import("@nodetool-ai/models");
      await migrateSqliteDb(getDefaultDbPath());
      await setupLocalDb();
      await Project.ensurePersonal(LOCAL_USER_ID);
      const { buildConfiguredProviders } = await import("../providers.js");
      const providers = await buildConfiguredProviders();
      const tool = buildCliToolbelt(providers, registry).find(
        (candidate) => candidate.name === name
      );
      if (!tool) {
        throw new Error(
          `Unknown tool: ${name}. Use nodetool tools list to discover names.`
        );
      }
      const { createChatContext } = await import("../chat-context.js");
      const context = await createChatContext({
        workspaceDir: process.cwd(),
        userId: LOCAL_USER_ID
      });
      for (const [id, provider] of Object.entries(providers)) {
        context.registerProvider(id, provider);
      }
      const { RUN_BUDGET_CONTEXT_KEY } = await import("@nodetool-ai/runtime");
      const { PERMISSION_GATE_CONTEXT_KEY, headlessGate } =
        await import("@nodetool-ai/agents");
      const { createCliRunBudget } = await import("../run-budget.js");
      context.set(RUN_BUDGET_CONTEXT_KEY, await createCliRunBudget());
      context.set(PERMISSION_GATE_CONTEXT_KEY, headlessGate("CLI tool call"));
      const { attachRunCostLedger } = await import("@nodetool-ai/execution");
      const ledger = attachRunCostLedger(context, {
        userId: LOCAL_USER_ID,
        workflowId: null
      });
      const controller = new AbortController();
      const cancel = (): void =>
        controller.abort(new Error("Tool call interrupted"));
      context.signal = controller.signal;
      process.once("SIGINT", cancel);
      process.once("SIGTERM", cancel);
      try {
        return await tool.execute(context, args);
      } finally {
        await ledger.settled();
        ledger();
        process.removeListener("SIGINT", cancel);
        process.removeListener("SIGTERM", cancel);
      }
    }
  };
}

export async function parseToolArguments(
  raw: string
): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(
    raw.startsWith("@") ? await readFile(raw.slice(1), "utf8") : raw
  );
  if (!isRecord(value)) {
    throw new Error(
      "--args must be a JSON object or @path to a JSON object file."
    );
  }
  return value;
}

/** Inspect only result envelopes whose tool contracts define failure statuses. */
function toolCallFailed(name: string, result: unknown): boolean {
  if (!isRecord(result)) {
    return false;
  }
  if (
    commandFailureExitCode(result) === 3 ||
    result.error ||
    result.isError === true ||
    result.success === false ||
    result.ok === false
  ) {
    return true;
  }
  switch (name) {
    case "get_node_info":
    case "search_nodes":
      return result.status === "error";
    case "run_node":
    case "run_workflow":
    case "resolve_workflow_escalation":
      return result.status === "failed" || result.status === "error";
    case "debug_app":
      return (
        result.status === "failed" ||
        (isRecord(result.verdict) && result.verdict.ok === false)
      );
    case "debug_workflow":
      return (
        isRecord(result.run) &&
        (result.run.status === "failed" ||
          result.run.status === "error" ||
          Boolean(result.run.error) ||
          (isRecord(result.run.verdict) && result.run.verdict.ok === false))
      );
    default:
      return false;
  }
}

export const AUTHORING_HELP = `
Authoring tools and starting documents:
  nodetool tools list timeline
  nodetool tools info create_timeline
  nodetool skills list
  nodetool skills read storyboard-core
  nodetool skills read motion-graphics
  nodetool skills read nodetool-workflow-builder
  nodetool skills read nodetool-app-builder
  nodetool skills read native-game
  nodetool tools call list_projects
  nodetool tools call create_timeline --args '{"name":"My timeline"}'
  nodetool tools call <name> --args @arguments.json

Tools expose their current input schemas. Read the matching shipped guide
before creating workflows, timelines, motion graphics, mini apps, or games.
`;

export function registerAuthoringCommands(
  program: Command,
  load: () => Promise<AuthoringTools> = localTools
): void {
  const run = async (
    name: string,
    args: Record<string, unknown>
  ): Promise<void> => {
    try {
      const result = await (await load()).call(name, args);
      asJson(result);
      if (toolCallFailed(name, result)) {
        const failure =
          name === "debug_workflow" && isRecord(result) && isRecord(result.run)
            ? result.run
            : result;
        process.exitCode = commandFailureExitCode(failure);
      }
    } catch (error) {
      process.exitCode = printCommandError(error, true);
    }
  };
  const tools = program
    .command("tools")
    .description("Discover tool schemas and call local authoring tools")
    .addHelpText("after", AUTHORING_HELP);
  tools
    .command("list [query]")
    .description("List tool names and descriptions, optionally filtered")
    .action(async (query?: string) => {
      const matches = (await (await load()).list()).filter(
        (tool) =>
          !query ||
          `${tool.name} ${tool.description}`
            .toLowerCase()
            .includes(query.toLowerCase())
      );
      asJson(
        matches.map((tool) => ({
          name: tool.name,
          description: tool.description
        }))
      );
    });
  tools
    .command("info <name>")
    .description("Print the authoritative input schema for a tool")
    .action(async (name: string) => {
      const tool = (await (await load()).list()).find(
        (candidate) => candidate.name === name
      );
      if (!tool) {
        throw new Error(`Unknown tool: ${name}. Use nodetool tools list.`);
      }
      asJson({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      });
    });
  tools
    .command("call <name>")
    .description(
      "Execute a local tool. Calls can save documents, run jobs, or use configured providers."
    )
    .option(
      "--args <json|@file>",
      "JSON arguments, inline or read from a file",
      "{}"
    )
    .action(async (name: string, options: { args: string }) =>
      run(name, await parseToolArguments(options.args))
    );
  const skills = program
    .command("skills")
    .description("Find and read installed authoring guides and user skills");
  skills
    .command("list [query]")
    .description("Search the installed skill catalog")
    .action(async (query?: string) =>
      run("list_skills", query ? { query } : {})
    );
  skills
    .command("read <name>")
    .description(
      "Read a guide, including its starting examples and tool instructions"
    )
    .action(async (name: string) => run("load_skill", { name }));
  program.addHelpText("after", AUTHORING_HELP);
  for (const name of [
    "timeline",
    "game",
    "app",
    "apps",
    "workflows",
    "jsscript",
    "sketch"
  ]) {
    program.commands
      .find((command) => command.name() === name)
      ?.addHelpText("after", AUTHORING_HELP);
  }
}
