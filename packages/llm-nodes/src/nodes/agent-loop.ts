import { createLogger } from "@nodetool-ai/config";
import type {
  Message,
  MessageContent,
  ProcessingContext,
  ProviderTool
} from "@nodetool-ai/runtime";
import type { Chunk } from "@nodetool-ai/protocol";
import { Tool as AgentTool } from "@nodetool-ai/agents";
import { hydrateBuiltinAgentTools } from "./agent-tool-hydration.js";
import type { ToolLike } from "./agent-utils.js";
import {
  classifyProviderStream,
  serializeToolResult,
  toProviderTools,
  toolCallChunk
} from "./agent-utils.js";

const log = createLogger("nodetool.base-nodes.agents");

/**
 * Adapter that wraps a ToolLike (from base-nodes) as an AgentTool (from @nodetool-ai/agents).
 * This bridges the tool systems so Agent can use tools defined in the node graph.
 */
export class ToolLikeAdapter extends AgentTool {
  readonly name: string;
  readonly description: string;
  protected readonly jsonSchema: Record<string, unknown>;
  private readonly _process: (
    context: ProcessingContext,
    params: Record<string, unknown>
  ) => Promise<unknown>;

  constructor(toolLike: ToolLike) {
    super();
    this.name = toolLike.name;
    this.description = toolLike.description ?? "";
    this.jsonSchema = toolLike.inputSchema ?? {
      type: "object",
      properties: {}
    };
    this._process =
      toolLike.process ??
      (async () => ({ error: "Tool has no process implementation" }));
  }

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this._process(context, params);
  }
}

export interface AgentLoopOptions {
  context: ProcessingContext;
  providerId: string;
  modelId: string;
  systemPrompt: string;
  prompt: string;
  /**
   * Tools the model may call. Each may be a fully-formed {@link ToolLike} (has
   * `process` + `inputSchema`) OR a bare name-stub (`{ name }`) for a builtin
   * tool registered via `registerBuiltinAgentToolClasses` — runAgentLoop
   * hydrates stubs by name. Anything that can't be hydrated (no `process`) is
   * logged and treated as an unknown tool by the model.
   */
  tools: ToolLike[];
  contentParts?: MessageContent[];
  maxTokens?: number;
  maxIterations?: number;
  threadId?: string;
  /**
   * Optional sink for streamed assistant text deltas (non-thinking). Lets a
   * caller surface incremental output (e.g. a node `chunk` output) without
   * changing the loop's accumulate-and-return contract.
   */
  onText?: (delta: string) => void;
  /**
   * Optional sink for each tool call the model makes, formatted as a
   * `tool_call` {@link Chunk} (same shape the Agent node emits). Fired just
   * before the tool runs.
   */
  onToolCall?: (chunk: Chunk) => void;
}

export interface AgentLoopResult {
  text: string;
  messages: Message[];
}

/**
 * Run a streaming tool-use loop: the model streams text/tool-calls, tools
 * execute, results feed back, repeat until no more tool calls or
 * `maxIterations`. Returns the final assistant text plus the full message
 * trail. Stream via `onText` / `onToolCall`.
 *
 * Tools (`options.tools`) may be real {@link ToolLike}s or bare `{ name }`
 * stubs for registered builtin tools — they are hydrated here (see the `tools`
 * field doc). This mirrors the AgentNode's `normalizeTools`; both paths now
 * hydrate, so a tool reaches the loop the same way regardless of entry point.
 */
export async function runAgentLoop(
  options: AgentLoopOptions
): Promise<AgentLoopResult> {
  const {
    context,
    providerId,
    modelId,
    systemPrompt,
    prompt,
    tools,
    contentParts,
    maxTokens = 4096,
    maxIterations = 10
  } = options;

  if (!context || typeof context.getProvider !== "function") {
    throw new Error("Processing context with provider access is required");
  }

  const userContent: MessageContent[] = [{ type: "text", text: prompt }];
  if (contentParts) {
    userContent.push(...contentParts);
  }

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent }
  ];

  // Hydrate builtin tools passed as bare name-stubs ({ name }) into real Tool
  // instances (same as the AgentNode path's normalizeTools). Without this a
  // stub has no `process`/`inputSchema`, so the model gets a schemaless tool
  // and every call is rejected as "Unknown tool". A real Tool passes through
  // unchanged. Warn for anything still unrunnable so it fails loudly, not
  // silently.
  const resolvedTools = hydrateBuiltinAgentTools(tools) as ToolLike[];
  for (const t of resolvedTools) {
    if (typeof t.process !== "function") {
      log.warn(
        `runAgentLoop received tool '${t.name}' with no process() and could ` +
          "not hydrate it — the model cannot call it. Pass a real Tool or a " +
          "registered builtin tool name."
      );
    }
  }

  // The provider drives the tool-calling loop via generateLoop. This is what
  // makes the Claude Agent SDK provider work: it registers `providerTools` as
  // an in-process MCP server and runs the SDK's own loop, while normal
  // providers run the standard completion loop. Each provider tool carries its
  // own `execute` (generateLoop dispatches to it), so there is no harness-level
  // executeTool callback. The stream surfaces text chunks (for onText),
  // tool-call announcements (for onToolCall), and finalized message events
  // (assistant turns + tool results) that we collect into the returned
  // conversation. There is no terminal tool here — the loop ends when the model
  // stops calling tools.
  const providerTools: ProviderTool[] | undefined =
    resolvedTools.length > 0
      ? toProviderTools(resolvedTools).map((pt, i) => {
          const tool = resolvedTools[i];
          return {
            ...pt,
            execute: async (
              args: Record<string, unknown>
            ): Promise<string | MessageContent[]> => {
              if (typeof tool.process !== "function") {
                return JSON.stringify({ error: `Unknown tool: ${tool.name}` });
              }
              const result = await tool.process(context, args);
              return JSON.stringify(serializeToolResult(result));
            }
          };
        })
      : undefined;
  const provider = await context.getProvider(providerId);

  // generateLoop owns its own copy of the message array internally, so rebuild
  // the full returned conversation locally from the message events it streams.
  const outMessages: Message[] = [...messages];
  let lastAssistantText = "";
  let currentTurnText = "";

  const stream = provider.generateLoop({
    messages,
    model: modelId,
    tools: providerTools,
    maxTokens,
    threadId: options.threadId,
    maxIterations,
    // Run-level cancellation: without it a cancelled workflow leaves this
    // loop (and its tool calls) running.
    signal: context.signal
  });
  for await (const event of classifyProviderStream(stream)) {
    if (event.kind === "tool_call") {
      options.onToolCall?.(toolCallChunk(event.toolCall));
      continue;
    }
    if (event.kind === "text") {
      // Only genuine text feeds the returned text / onText stream. Tool-call
      // chunks (and audio, agent_status, etc.) carry content_type !== "text"
      // and must not leak into the text output.
      if (event.chunk.content_type === "text" && event.delta) {
        currentTurnText += event.delta;
        options.onText?.(event.delta);
      }
      continue;
    }
    // thinking / audio events carry no returned text — ignore them here.
    if (event.kind === "assistant_message" || event.kind === "tool_message") {
      // A finalized message event. Append it to the returned trail; an assistant
      // turn also closes the current text run so `text` reflects the model's
      // last assistant message, not a concatenation.
      outMessages.push(event.message);
      if (event.kind === "assistant_message") {
        if (currentTurnText) lastAssistantText = currentTurnText;
        currentTurnText = "";
      }
    }
  }

  // A provider that runs its own loop may stream final text without a trailing
  // assistant message event — keep that text.
  if (currentTurnText) lastAssistantText = currentTurnText;

  return { text: lastAssistantText, messages: outMessages };
}
