/**
 * Stdin mode — read chat messages (or agent objectives) from stdin, write responses to stdout.
 *
 * Activated automatically when stdin is not a TTY (i.e. piped input).
 * Each non-empty line is sent as a user message / agent objective.
 * The assistant reply streams to stdout, followed by a newline.
 * Conversation history is preserved across lines within a single session.
 *
 * Supports both direct-provider mode and WebSocket server mode (--url).
 *
 * Slash commands (WebSocket mode only):
 *   /run <workflow_id> [json_params]  — run a workflow
 *   /stop                             — stop in-progress generation
 *   /reconnect <job_id>               — reconnect to a running job
 *   /cancel <job_id>                  — cancel a running job
 *   /status [job_id]                  — get job/all-jobs status
 *   /new                              — start a new chat session
 *   /compact [instructions]           — summarize conversation into retained context
 *   /help                             — show available commands
 */

import readline from "node:readline";
import type { BaseProvider, Message, RunBudget } from "@nodetool-ai/runtime";
import { RUN_BUDGET_CONTEXT_KEY } from "@nodetool-ai/runtime";
import { processChat } from "@nodetool-ai/chat";
import {
  applySystemPrompt,
  buildCliAgentBelt,
  createCliCodeActTurn
} from "./chat-codeact.js";
import { createChatContext } from "./chat-context.js";
import { budgetStopReason, createCliRunBudget } from "./run-budget.js";
import { isString } from "./predicates.js";
import {
  getBuiltinTools,
  PERMISSION_GATE_CONTEXT_KEY,
  type PermissionMode
} from "@nodetool-ai/agents";
import { createCliPermissionGate } from "./permission-gate.js";
import type { Tool } from "@nodetool-ai/agents/tool";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import { createProvider } from "./providers.js";
import { WebSocketChatClient, type JobEvent } from "./websocket-client.js";
import {
  isCodeAction,
  isFormattedTool,
  toolStatusLabel,
  formatToolResult,
} from "./tool-format.js";

interface StdinModeOptions {
  provider: string;
  model: string;
  workspaceDir: string;
  wsUrl?: string;
  /** NodeRegistry — currently unused by the unified loop, kept for parity. */
  registry?: NodeRegistry;
  /** Configured BaseProvider instances by id (passed through to subtasks). */
  agentProviders?: Record<string, BaseProvider>;
  /**
   * Expose the read-only `run_search` fan-out primitive alongside
   * `run_subtask`. On by default; set `false` to remove it.
   */
  enableReadOnlySearch?: boolean;
  /** `--permission-mode`. Unset runs `auto`: stdin is the input, not a user. */
  permissionMode?: PermissionMode;
  /** `--cost-cap <usd>`; `0` lifts the cap. Bounds each turn, as chat's does. */
  costCap?: string;
  /** `--timeout <s>`; `0` leaves the turn no time at all. */
  timeout?: string;
}

interface SlashCommand {
  name: string;
  args: string;
}

function parseSlashCommand(line: string): SlashCommand | null {
  if (!line.startsWith("/")) return null;
  const spaceIdx = line.indexOf(" ");
  if (spaceIdx === -1) {
    return { name: line.slice(1).toLowerCase(), args: "" };
  }
  return {
    name: line.slice(1, spaceIdx).toLowerCase(),
    args: line.slice(spaceIdx + 1).trim()
  };
}

async function displayJobEvents(
  events: AsyncGenerator<JobEvent>
): Promise<void> {
  for await (const event of events) {
    if (event.type === "job_update") {
      process.stderr.write(`[job] ${event.status}\n`);
      if (event.error) {
        process.stderr.write(`[error] ${event.error}\n`);
      }
      if (event.result) {
        process.stdout.write(JSON.stringify(event.result, null, 2));
        process.stdout.write("\n");
      }
    } else if (event.type === "node_update") {
      process.stderr.write(`[node ${event.node_id}] ${event.status}\n`);
    } else if (event.type === "output_update") {
      process.stdout.write(JSON.stringify(event.value, null, 2));
      process.stdout.write("\n");
    } else if (event.type === "node_progress") {
      const pct = event.total
        ? `${event.progress}/${event.total}`
        : `${event.progress}`;
      process.stderr.write(`[progress ${event.node_id}] ${pct}\n`);
    } else if (event.type === "error") {
      process.stderr.write(`Error: ${event.message}\n`);
      break;
    } else if (event.type === "done") {
      break;
    }
  }
}

async function handleSlashCommand(
  cmd: SlashCommand,
  wsClient: WebSocketChatClient,
  startNewSession: () => void
): Promise<void> {
  switch (cmd.name) {
    case "run": {
      // /run <workflow_id> [json_params]
      const parts = cmd.args.split(/\s+/);
      const workflowId = parts[0];
      if (!workflowId) {
        process.stderr.write("Usage: /run <workflow_id> [json_params]\n");
        return;
      }
      let params: Record<string, unknown> = {};
      if (parts.length > 1) {
        const jsonStr = parts.slice(1).join(" ");
        try {
          params = JSON.parse(jsonStr);
        } catch {
          process.stderr.write(`Invalid JSON params: ${jsonStr}\n`);
          return;
        }
      }

      process.stderr.write(`Running workflow ${workflowId}...\n`);
      await displayJobEvents(wsClient.runJob({ workflowId, params }));
      return;
    }

    case "stop": {
      wsClient.stop();
      process.stderr.write("Stop requested\n");
      return;
    }

    case "reconnect": {
      const jobId = cmd.args.trim();
      if (!jobId) {
        process.stderr.write("Usage: /reconnect <job_id>\n");
        return;
      }
      process.stderr.write(`Reconnecting to job ${jobId}...\n`);
      await displayJobEvents(wsClient.reconnectJob(jobId));
      return;
    }

    case "cancel": {
      const jobId = cmd.args.trim();
      if (!jobId) {
        process.stderr.write("Usage: /cancel <job_id>\n");
        return;
      }
      wsClient.cancelJob(jobId);
      process.stderr.write(`Cancel requested for job ${jobId}\n`);
      return;
    }

    case "status": {
      const jobId = cmd.args.trim() || undefined;
      wsClient.getStatus(jobId);
      process.stderr.write(
        jobId
          ? `Status requested for job ${jobId}\n`
          : "Status requested for all jobs\n"
      );
      return;
    }

    case "new":
      startNewSession();
      process.stderr.write("New session started\n");
      return;

    case "help":
      process.stdout.write(
        [
          "Available commands:",
          "  /run <workflow_id> [json_params]  — Run a workflow",
          "  /stop                             — Stop in-progress generation",
          "  /reconnect <job_id>               — Reconnect to a running job",
          "  /cancel <job_id>                  — Cancel a running job",
          "  /status [job_id]                  — Get job status",
          "  /new                              — Start a new chat session",
          "  /compact [instructions]           — Summarize conversation into retained context",
          "  /help                             — Show this help",
          "",
          "Any other input is sent as a chat message.",
          ""
        ].join("\n")
      );
      return;

    default:
      process.stderr.write(
        `Unknown command: /${cmd.name}. Type /help for available commands.\n`
      );
  }
}

export async function runStdinMode(opts: StdinModeOptions): Promise<void> {
  const wsClient = opts.wsUrl ? new WebSocketChatClient(opts.wsUrl) : null;
  if (wsClient) {
    await wsClient.connect();
  }

  // Direct mode: create provider once for the session
  const directProvider = wsClient ? null : await createProvider(opts.provider);

  // One gate for the whole session, so an "allow for the rest of this session"
  // answer outlives the line that gave it — the belt below is rebuilt per line.
  // Stdin carries the messages here, so there is nobody to prompt: this is the
  // headless gate, and it says so once. In `--url` mode the server holds the
  // gate for its own belt and this process runs none, so none is built.
  const gate = directProvider
    ? createCliPermissionGate({
        hostName: "nodetool-chat",
        mode: opts.permissionMode,
        interactive: false
      })
    : null;

  // Build the unified-loop toolset for direct mode. `run_subtask` lets the
  // agent decompose work recursively without any flag — the same primitive
  // the websocket server exposes.
  const buildDirectTools = (
    prov: BaseProvider | null,
    budget: RunBudget
  ): Tool[] => {
    if (!prov || !gate) return [];
    // The builtin belt. This used to be an `extras` parameter that only the
    // (now removed) `--sandbox` flag ever filled, so a normal CLI run reached
    // the model with nothing on it: no `view_image`, so a headless turn could
    // not look at an image at all, and every `nodetool.media.*` method threw
    // naming a tool the belt did not carry. `createCliCodeActTurn` adds
    // `execute_code` itself and appends `view_image` only if it finds it here,
    // which is why an empty belt silently removed the one channel for pixels.
    return buildCliAgentBelt({
      baseTools: getBuiltinTools(),
      provider: prov,
      model: opts.model,
      forwardMessage: (msg: ProcessingMessage) => {
        if (msg.type === "chunk") {
          process.stdout.write(isString(msg.content) ? msg.content : "");
        } else if (msg.type === "tool_call_update") {
          process.stderr.write(`[tool] ${msg.name}\n`);
        }
      },
      gate,
      readOnlySearch: opts.enableReadOnlySearch !== false,
      budget
    });
  };

  /**
   * One local turn, in CodeAct: the provider is offered `execute_code`
   * (+ `view_image`) and the toolbelt lives in the sandbox — the same
   * contract a server-side chat session runs on.
   */
  const runCodeActTurn = async (
    userInput: string,
    prov: BaseProvider,
    tools: Tool[],
    budget: RunBudget
  ): Promise<void> => {
    const context = await createChatContext({
      workspaceDir: opts.workspaceDir ?? null
    });
    // Loops this file never constructs — a JS script, an `AgentNode` reached
    // through `run_node` — read the gate here instead of building an ungated
    // run of their own (`gateFromContext`).
    if (gate) context.set(PERMISSION_GATE_CONTEXT_KEY, gate);
    // The same channel the gate takes: a loop this file never constructs reads
    // the turn's bounds off the context rather than opening its own
    // (invariant I-2).
    context.set(RUN_BUDGET_CONTEXT_KEY, budget);
    const turn = createCliCodeActTurn({
      tools,
      context,
      onToolCall: ({ name }) => {
        process.stderr.write(`[tool] ${name}\n`);
      }
    });
    applySystemPrompt(chatHistory, turn.systemPrompt);
    await processChat({
      userInput,
      messages: chatHistory,
      model: opts.model,
      provider: prov,
      context,
      tools: turn.tools,
      turnBudget: budget,
      callbacks: {
        onChunk: (text) => {
          process.stdout.write(text);
        },
        onToolCall: (tc) => {
          process.stderr.write(
            isCodeAction(tc.name)
              ? `[tool] Run  ${toolStatusLabel(tc.name, tc.args)}\n`
              : `[tool] ${tc.name}\n`
          );
        },
        onToolResult: (tc, result) => {
          if (!isFormattedTool(tc.name)) return;
          const preview = formatToolResult(tc.name, tc.args, result);
          process.stderr.write(`[result] ${preview.split("\n")[0]}\n`);
        }
      }
    });
    // A ceiling ended the turn, not the model finishing its answer. Stdout
    // carries the reply, so the reason goes to stderr beside the tool trace.
    const stopReason = budgetStopReason(budget);
    if (stopReason) process.stderr.write(`[stopped] ${stopReason}\n`);
  };

  let threadId = crypto.randomUUID();
  let chatHistory: Message[] = [];

  const startNewSession = () => {
    threadId = crypto.randomUUID();
    chatHistory = [];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Slash commands — most are WebSocket-only, but /new is local session state.
    const cmd = parseSlashCommand(trimmed);
    if (cmd) {
      if (cmd.name === "new") {
        startNewSession();
        process.stderr.write("New session started\n");
      } else if (wsClient) {
        await handleSlashCommand(cmd, wsClient, startNewSession);
      } else {
        process.stderr.write(
          "Slash commands require --url (WebSocket mode).\n"
        );
      }
      continue;
    }

    if (wsClient) {
      // --- Regular chat via WebSocket (server handles everything) ---
      for await (const event of wsClient.chat(
        trimmed,
        threadId,
        opts.model,
        opts.provider
      )) {
        if (event.type === "chunk") {
          process.stdout.write(event.content);
        } else if (event.type === "tool_call") {
          if (isCodeAction(event.name)) {
            process.stderr.write(
              `[tool] Run  ${toolStatusLabel(event.name, event.args)}\n`
            );
          } else {
            const argsStr =
              Object.keys(event.args).length > 0
                ? JSON.stringify(event.args)
                : "";
            process.stderr.write(
              `[tool] ${event.name}${argsStr ? `(${argsStr})` : ""}\n`
            );
          }
        } else if (event.type === "tool_result") {
          if (isFormattedTool(event.name)) {
            const preview = formatToolResult(
              event.name,
              undefined,
              event.content
            );
            process.stderr.write(`[result] ${preview.split("\n")[0]}\n`);
          } else {
            const preview =
              event.content.length > 200
                ? event.content.slice(0, 200) + "..."
                : event.content;
            process.stderr.write(`[result] ${event.name}: ${preview}\n`);
          }
        } else if (event.type === "output_update") {
          process.stdout.write(JSON.stringify(event.value, null, 2));
          process.stdout.write("\n");
        } else if (event.type === "error") {
          process.stderr.write(`Error: ${event.message}\n`);
          break;
        } else if (event.type === "done") {
          break;
        }
      }
    } else {
      // --- Regular chat via direct provider ---
      // One budget per turn, as a server chat turn does: a piped session runs
      // for as long as its input lasts, and one deadline over all of it would
      // stop a later line for time an earlier one spent.
      const budget = await createCliRunBudget({
        ...(opts.costCap !== undefined && { costCap: opts.costCap }),
        ...(opts.timeout !== undefined && { timeout: opts.timeout })
      });
      await runCodeActTurn(
        trimmed,
        directProvider!,
        buildDirectTools(directProvider, budget),
        budget
      );
    }

    process.stdout.write("\n");
  }

  wsClient?.disconnect();
}
