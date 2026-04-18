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
 *   /resume <job_id>                  — resume a paused job
 *   /cancel <job_id>                  — cancel a running job
 *   /status [job_id]                  — get job/all-jobs status
 *   /help                             — show available commands
 */

import readline from "node:readline";
import type { Message } from "@nodetool/runtime";
import { ProcessingContext } from "@nodetool/runtime";
import { processChat } from "@nodetool/chat";
import { Agent } from "@nodetool/agents";
import { createProvider, WebSocketProvider } from "./providers.js";
import { WebSocketChatClient, type JobEvent } from "./websocket-client.js";
import { getSecret } from "@nodetool/models";

export interface StdinModeOptions {
  provider: string;
  model: string;
  workspaceDir: string;
  agentMode?: boolean;
  wsUrl?: string;
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
  wsClient: WebSocketChatClient
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

    case "resume": {
      const jobId = cmd.args.trim();
      if (!jobId) {
        process.stderr.write("Usage: /resume <job_id>\n");
        return;
      }
      process.stderr.write(`Resuming job ${jobId}...\n`);
      await displayJobEvents(wsClient.resumeJob(jobId));
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

    case "help":
      process.stdout.write(
        [
          "Available commands:",
          "  /run <workflow_id> [json_params]  — Run a workflow",
          "  /stop                             — Stop in-progress generation",
          "  /reconnect <job_id>               — Reconnect to a running job",
          "  /resume <job_id>                  — Resume a paused job",
          "  /cancel <job_id>                  — Cancel a running job",
          "  /status [job_id]                  — Get job status",
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

  const threadId = crypto.randomUUID();
  const chatHistory: Message[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Slash commands — only supported in WebSocket mode
    const cmd = parseSlashCommand(trimmed);
    if (cmd) {
      if (wsClient) {
        await handleSlashCommand(cmd, wsClient);
      } else {
        process.stderr.write(
          "Slash commands require --url (WebSocket mode).\n"
        );
      }
      continue;
    }

    if (opts.agentMode) {
      // --- Agent mode: each line is an objective ---
      const prov = wsClient
        ? new WebSocketProvider(wsClient, opts.model, opts.provider)
        : directProvider!;

      const agent = new Agent({
        name: "stdin-agent",
        objective: trimmed,
        provider: prov,
        model: opts.model,
        tools: [],
        outputFormat: "markdown",
        maxStepIterations: 20
      });

      const ctx = new ProcessingContext({
        jobId: crypto.randomUUID(),
        userId: "1",
        workspaceDir: opts.workspaceDir,
        secretResolver: getSecret
      });
      let taskResult: string | null = null;

      for await (const msg of agent.execute(ctx)) {
        if (msg.type === "chunk") {
          if (taskResult === null) {
            process.stdout.write((msg as { content?: string }).content ?? "");
          }
        } else if (msg.type === "step_result") {
          const sr = msg as { result: unknown; is_task_result: boolean };
          if (sr.is_task_result) {
            taskResult =
              typeof sr.result === "string"
                ? sr.result
                : JSON.stringify(sr.result, null, 2);
          }
        } else if (msg.type === "planning_update") {
          process.stderr.write(
            `[planning] ${(msg as { content: string }).content.slice(0, 80)}\n`
          );
        } else if (msg.type === "task_update") {
          process.stderr.write(`[task] ${(msg as { event: string }).event}\n`);
        } else if (msg.type === "tool_call_update") {
          process.stderr.write(`[tool] ${(msg as { name: string }).name}\n`);
        }
      }

      if (taskResult !== null) {
        process.stdout.write(taskResult);
      }
    } else if (wsClient) {
      // --- Regular chat via WebSocket ---
      for await (const event of wsClient.chat(
        trimmed,
        threadId,
        opts.model,
        opts.provider
      )) {
        if (event.type === "chunk") {
          process.stdout.write(event.content);
        } else if (event.type === "tool_call") {
          const argsStr =
            Object.keys(event.args).length > 0
              ? JSON.stringify(event.args)
              : "";
          process.stderr.write(
            `[tool] ${event.name}${argsStr ? `(${argsStr})` : ""}\n`
          );
        } else if (event.type === "tool_result") {
          // Truncate long results for display
          const preview =
            event.content.length > 200
              ? event.content.slice(0, 200) + "..."
              : event.content;
          process.stderr.write(`[result] ${event.name}: ${preview}\n`);
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
      await processChat({
        userInput: trimmed,
        messages: chatHistory,
        model: opts.model,
        provider: directProvider!,
        context: new ProcessingContext({
          jobId: crypto.randomUUID(),
          userId: "1",
          workspaceDir: opts.workspaceDir,
          secretResolver: getSecret
        }),
        tools: [],
        callbacks: {
          onChunk: (text) => {
            process.stdout.write(text);
          }
        }
      });
    }

    process.stdout.write("\n");
  }

  wsClient?.disconnect();
}
