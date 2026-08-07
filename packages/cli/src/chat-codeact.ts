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
 * `view_image` is the exception, as on the server: it is the one channel that
 * puts pixels into the model's context, and pixels cannot ride the sandbox's
 * JSON observation envelope. It stays a direct provider tool.
 */

import type {
  JsonSchema,
  Message,
  ProcessingContext
} from "@nodetool-ai/runtime";
import {
  Tool,
  createChatCodeActSession,
  type ChatCodeActSession
} from "@nodetool-ai/agents";

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
    this.jsonSchema = session.providerTool.inputSchema as JsonSchema;
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this.session.executeAction(params);
  }

  override userMessage(params: Record<string, unknown>): string {
    const title = params["title"];
    return typeof title === "string" && title.trim()
      ? title.trim()
      : "Executing code action";
  }
}

export interface CliCodeActTurn {
  /** The tools handed to the provider: `execute_code` (+ `view_image`). */
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
  const beltTools = options.tools.filter((t) => t.name !== VIEW_IMAGE_TOOL);

  const session = createChatCodeActSession({
    tools: beltTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    })),
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

  const tools: Tool[] = [new ExecuteCodeTool(session)];
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
