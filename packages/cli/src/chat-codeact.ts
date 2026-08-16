/**
 * CodeAct wiring for a local (no-server) chat turn.
 *
 * A chat turn acts by writing sandboxed JavaScript over the toolbelt, not by
 * emitting JSON tool calls — the same contract the WebSocket chat runner uses
 * (`createChatCodeActSession`). The CLI reaches it through `processChat`, so
 * the session's `execute_code` is handed over as an ordinary {@link Tool}
 * whose `process()` runs one code action; the toolbelt itself moves inside the
 * sandbox and is never offered to the provider.
 *
 * Two sets also reach the provider directly, as on the server. The direct
 * tools (`DIRECT_TOOL_NAMES` — file, search, fetch, todo, delegation, plus
 * model and node discovery) are the shapes every model is trained on, so they
 * cost less as a plain tool call than as a sandbox round trip; they stay on
 * the belt too, because code composes them.
 * And `view_image` is the one channel that puts pixels into the model's
 * context, which cannot ride the JSON observation envelope.
 */

import type {
  JsonSchema,
  Message,
  ProcessingContext
} from "@nodetool-ai/runtime";
import { DIRECT_TOOL_NAMES } from "@nodetool-ai/runtime";
import {
  Tool,
  createChatCodeActSession,
  type ChatCodeActSession
} from "@nodetool-ai/agents";
import { isNonBlankString } from "./predicates.js";

/** The tool that stays a direct provider tool alongside `execute_code`. */
const VIEW_IMAGE_TOOL = "view_image";

/** One code action, exposed to `processChat` as a tool. */
class ExecuteCodeTool extends Tool {
  readonly name: string;
  readonly description: string;
  protected override readonly jsonSchema: JsonSchema;

  constructor(private readonly session: ChatCodeActSession) {
    super();
    this.name = session.providerTool.name;
    this.description = session.providerTool.description;
    this.jsonSchema = session.providerTool.inputSchema;
  }

  // HOLDOUT (anti-slop/no-unknown-returns): a CodeAct action answers with
  // whatever its body returned, and the base `Tool.process` contract in
  // `@nodetool-ai/agents` declares `Promise<unknown>`.
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this.session.executeAction(params);
  }

  override userMessage(params: Record<string, unknown>): string {
    const title = params["title"];
    return isNonBlankString(title)
      ? title.trim()
      : "Executing code action";
  }
}

export interface CliCodeActTurn {
  /**
   * The tools handed to the provider: `execute_code`, the core tools, and
   * `view_image`.
   */
  tools: Tool[];
  /** System prompt for the turn: the CodeAct contract and tool catalog. */
  systemPrompt: string;
  session: ChatCodeActSession;
}

export interface CliCodeActTurnOptions {
  /** The full local toolbelt; it lives inside the sandbox. */
  tools: Tool[];
  context: ProcessingContext;
  signal?: AbortSignal;
  /** Fires before each tool the sandbox calls. */
  onToolCall?: (record: { name: string; args: Record<string, unknown> }) => void;
}

export function createCliCodeActTurn(
  options: CliCodeActTurnOptions
): CliCodeActTurn {
  const byName = new Map(options.tools.map((tool) => [tool.name, tool]));
  const directTools = options.tools.filter(
    (t) => t.name !== VIEW_IMAGE_TOOL && DIRECT_TOOL_NAMES.has(t.name)
  );
  const beltTools = options.tools.filter((t) => t.name !== VIEW_IMAGE_TOOL);

  const session = createChatCodeActSession({
    tools: beltTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    })),
    directToolNames: directTools.map((t) => t.name),
    executeTool: async (call) => {
      const tool = byName.get(call.name);
      if (!tool) throw new Error(`Tool "${call.name}" not available`);
      return Tool.executeTool(tool, options.context, call.args, {
        toolCallId: call.id
      });
    },
    context: options.context,
    signal: options.signal,
    onToolCall: options.onToolCall
  });

  const tools: Tool[] = [new ExecuteCodeTool(session), ...directTools];
  const viewImage = byName.get(VIEW_IMAGE_TOOL);
  if (viewImage) tools.push(viewImage);

  return { tools, systemPrompt: session.systemPromptSection, session };
}

/**
 * Put `systemPrompt` at the head of the history, replacing the previous
 * turn's — the catalog is rebuilt per turn and only the current one is true.
 */
export function applySystemPrompt(
  messages: Message[],
  systemPrompt: string
): void {
  if (messages.length > 0 && messages[0].role === "system") {
    messages[0] = { ...messages[0], content: systemPrompt };
    return;
  }
  messages.unshift({ role: "system", content: systemPrompt });
}
