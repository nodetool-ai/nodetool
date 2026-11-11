/**
 * Providers for CLIs that run their own agent and speak the Agent Client
 * Protocol. A turn that offers executable tools runs on the CLI's ACP server,
 * where the tools are served as an MCP server (see acp-session.ts).
 */

import { importNodeBuiltin } from "@nodetool-ai/config";
import { isString } from "@nodetool-ai/protocol";
import {
  BaseProvider,
  budgetStopItem,
  resolveTurnBudget,
  toolResultToText
} from "./base-provider.js";
import type {
  RunBudget,
  TurnBudget,
  TurnReservationHandle
} from "../turn-budget.js";
import {
  runAcpTurn,
  type AcpSpawner,
  type AcpToolCallInfo,
  type AcpToolOutcome
} from "./acp-session.js";
import { beginProviderRound, tracedProviderLoop, tracedToolCall } from "./loop-tracing.js";
import {
  isProviderToolErrorResult,
  type Message,
  type MessageContent,
  type MessageTextContent,
  type ProviderStreamItem,
  type ProviderTool,
  type ProviderToolResult,
  type ToolCall
} from "./types.js";

type AcpLoopArgs = Parameters<BaseProvider["generateMessages"]>[0] & {
  executeTool?: (toolCall: ToolCall) => Promise<ProviderToolResult>;
  maxIterations?: number;
  turnBudget?: TurnBudget | RunBudget;
  [key: string]: unknown;
};

export abstract class AcpCliProvider extends BaseProvider {
  /** Spawns the CLI's ACP server. */
  protected abstract readonly spawnAcp: AcpSpawner;
  /** How the CLI is named in errors, for example `Antigravity CLI`. */
  protected abstract readonly cliName: string;
  /** The CLI's command name, used in error messages. */
  protected abstract readonly cliLabel: string;
  /** The CLI's arguments, recorded with the request. */
  protected abstract readonly acpArgs: string[];
  /** Directory name under the system temp directory for the CLI's cwd. */
  protected abstract readonly scratchName: string;
  /** How the CLI reaches NodeTool's tools. */
  protected acpTransport: "stdio" | "http" = "stdio";
  /**
   * Recognises a permission request for one of the offered tools. Undefined
   * keeps the default, which matches `mcp_nodetool_*` tool names.
   */
  protected acpToolMatcher(
    _tools: readonly ProviderTool[]
  ): ((call: AcpToolCallInfo) => boolean) | undefined {
    return undefined;
  }

  /** The model id to select in the ACP session. Empty keeps the CLI default. */
  protected acpModelId(model: string): string {
    return model;
  }

  /**
   * Run the CLI's own agent loop over NodeTool's tools. A turn without
   * executable tools, or a structured-output request, keeps the single-turn
   * behaviour of the base class.
   */
  override async *generateLoop(
    args: Parameters<BaseProvider["generateMessages"]>[0] & {
      executeTool?: (toolCall: ToolCall) => Promise<ProviderToolResult>;
      maxIterations?: number;
      turnBudget?: TurnBudget | RunBudget;
      [key: string]: unknown;
    }
  ): AsyncGenerator<ProviderStreamItem> {
    const tools = args.tools ?? [];
    const forcedResult =
      tools.length === 1 && args.toolChoice === tools[0].name;
    const canExecute = Boolean(args.executeTool) || tools.some((t) => t.execute);
    if (tools.length === 0 || forcedResult || !canExecute) {
      return yield* super.generateLoop(args);
    }
    return yield* tracedProviderLoop(this.provider, args.model, () =>
      this.generateAcpLoop(args)
    );
  }

  protected async *generateAcpLoop(
    args: AcpLoopArgs
  ): AsyncGenerator<ProviderStreamItem> {
    const tools = args.tools ?? [];
    const { runBudget, turnBudget } = resolveTurnBudget(args.turnBudget);
    if (runBudget?.deadline.expired()) {
      yield budgetStopItem(runBudget);
      return;
    }
    // One reservation per model call: the first now, one more each time the
    // CLI sends a tool result back to the model.
    const reservations: TurnReservationHandle[] = [];
    if (turnBudget) {
      const first = this._admitTurn(turnBudget, args.model, args.messages);
      if (first === null) {
        yield budgetStopItem(runBudget);
        return;
      }
      reservations.push(first);
    }

    const systemPrompt = extractSystemPrompt(args.messages);
    const history = args.loadFullHistory
      ? await args.loadFullHistory()
      : args.messages;
    const prompt = buildFreshPrompt(history, systemPrompt, this.cliName);
    const cwd = await scratchWorkspace(this.scratchName);
    const byName = new Map(tools.map((t) => [t.name, t]));
    const abort = new AbortController();
    const onExternalAbort = () => abort.abort();
    if (args.signal?.aborted) abort.abort();
    else args.signal?.addEventListener("abort", onExternalAbort, { once: true });

    let budgetStop: ProviderStreamItem | null = null;
    const costBefore = this.getTotalCost();
    beginProviderRound(this.provider, args.model);
    this.recordRequestPayload({ args: this.acpArgs, prompt });

    // One assistant message per model turn, text and tool calls together, so
    // chat surfaces do not read a tool round as the end of the turn.
    let text = "";
    let calls: ToolCall[] = [];
    const flush = (): ProviderStreamItem | null => {
      const message = {
        role: "assistant" as const,
        content: text || null,
        toolCalls: calls.length ? calls : null
      };
      const empty = !text && calls.length === 0;
      text = "";
      calls = [];
      return empty ? null : { type: "message", message };
    };

    const executeTool = async (
      id: string,
      name: string,
      toolArgs: Record<string, unknown>
    ): Promise<AcpToolOutcome> => {
      const tool = byName.get(name);
      const call: ToolCall = { id, name, args: toolArgs };
      let result: ProviderToolResult;
      try {
        result = await tracedToolCall(call, () => {
          if (tool?.execute) return tool.execute(toolArgs, id);
          if (args.executeTool) return args.executeTool(call);
          throw new Error(`Tool "${name}" is not available`);
        });
      } catch (err) {
        result = { isError: true, content: err instanceof Error ? err.message : String(err) };
      }
      if (tool?.terminal) abort.abort();
      return outcomeOf(result);
    };

    try {
      for await (const event of runAcpTurn({
        spawn: this.spawnAcp,
        transport: this.acpTransport,
        label: this.cliLabel,
        isOwnTool: this.acpToolMatcher(tools),
        cwd,
        model: this.acpModelId(args.model),
        prompt,
        tools,
        executeTool,
        signal: abort.signal
      })) {
        if (event.type === "text") {
          text += event.text;
          yield { type: "chunk", content: event.text, done: false };
        } else if (event.type === "tool_call") {
          const call: ToolCall = { id: event.id, name: event.name, args: event.args };
          calls.push(call);
          yield call;
        } else if (event.type === "tool_result") {
          const assistant = flush();
          if (assistant) yield assistant;
          yield {
            type: "message",
            message: { role: "tool", toolCallId: event.id, content: event.outcome.text }
          };
          if (turnBudget) {
            const next = this._admitTurn(turnBudget, args.model, args.messages);
            if (next === null) {
              budgetStop = budgetStopItem(runBudget);
              abort.abort();
            } else {
              reservations.push(next);
            }
          }
        } else {
          if (event.usage) {
            this.trackUsage(args.model, event.usage);
          }
          const assistant = flush();
          if (assistant) yield assistant;
          yield { type: "chunk", content: "", done: true };
        }
      }
    } finally {
      args.signal?.removeEventListener("abort", onExternalAbort);
      if (turnBudget) {
        const observed = this.getTotalCost() - costBefore;
        let remaining = observed > 0 ? observed : null;
        for (const reservation of reservations) {
          turnBudget.commit(reservation, remaining);
          if (remaining !== null) remaining = 0;
        }
      }
    }
    if (budgetStop) yield budgetStop;
    else if (abort.signal.aborted && args.signal?.aborted) return;
  }
}

/** Collapse a tool result to the text and error flag MCP carries back. */
export function outcomeOf(result: ProviderToolResult): AcpToolOutcome {
  if (isProviderToolErrorResult(result)) {
    const content = result.content as string | MessageContent[];
    return { text: toolResultToText(content), isError: true };
  }
  return { text: toolResultToText(result), isError: false };
}

/** Flatten a message's content to plain text (text blocks only). */
export function textOf(content: Message["content"]): string {
  if (content == null) return "";
  if (isString(content)) return content;
  return content
    .filter((c): c is MessageTextContent => c.type === "text")
    .map((c) => c.text)
    .join("");
}

/** The CLIs accept only text prompts. Refuse images rather than drop them. */
export function assertTextOnly(messages: readonly Message[], cliName = "Antigravity CLI"): void {
  const withMedia = messages.some(
    (m) => Array.isArray(m.content) && m.content.some((c) => c.type !== "text")
  );
  if (withMedia) {
    throw new Error(
      `The ${cliName} accepts text prompts only. Remove the attached images or media, or pick another provider.`
    );
  }
}

export function extractSystemPrompt(messages: readonly Message[]): string {
  return messages
    .filter((m) => m.role === "system")
    .map((m) => textOf(m.content))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The prompt for a fresh conversation. The CLI has no system-prompt flag and
 * cannot import earlier turns, so instructions and prior history are sent as
 * delimited blocks ahead of the new user turn.
 */
export function buildFreshPrompt(
  messages: readonly Message[],
  systemPrompt: string,
  cliName = "Antigravity CLI"
): string {
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant");
  assertTextOnly(convo, cliName);
  const last = convo[convo.length - 1];
  const newTurn = last?.role === "user" ? textOf(last.content) : "";
  const prior = last?.role === "user" ? convo.slice(0, -1) : convo;
  const transcript = prior
    .map((m) => {
      const text = textOf(m.content);
      return text ? `${m.role === "assistant" ? "Assistant" : "User"}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  return [
    systemPrompt ? `<instructions>\n${systemPrompt}\n</instructions>` : "",
    transcript ? `<conversation_so_far>\n${transcript}\n</conversation_so_far>` : "",
    newTurn
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The empty directory the CLI runs in. Headless runs may read and write inside
 * their workspace, so it must never be the server's own working directory.
 */
export async function scratchWorkspace(name = "nodetool-antigravity"): Promise<string | null> {
  const [fs, os, path] = await Promise.all([
    importNodeBuiltin<typeof import("node:fs/promises")>("node:fs/promises"),
    importNodeBuiltin<typeof import("node:os")>("node:os"),
    importNodeBuiltin<typeof import("node:path")>("node:path")
  ]);
  if (!fs || !os || !path) return null;
  const dir = path.join(os.tmpdir(), name);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

