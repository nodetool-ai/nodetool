/**
 * Tool calling for chat models that have no tool-call API and write their
 * calls as text: local Transformers.js models and the ChatGPT and Gemini web
 * chats. The prompt lists the tools and asks for `<tool_call>` blocks of JSON
 * in the Hermes format, which small models such as SmolLM2 were trained on.
 * {@link parseToolCalls} reads the calls back out of the reply.
 */

import { randomUUID } from "node:crypto";
import { isNonEmptyString, isRecord, isString } from "@nodetool-ai/protocol";
import type { ProviderTool, ToolCall } from "./types.js";

const OPEN = "<tool_call>";

/** A tool in the OpenAI function format that chat templates expect. */
export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: NonNullable<ProviderTool["inputSchema"]>;
  };
}

export function toToolSpecs(tools: ProviderTool[]): ToolSpec[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema ?? { type: "object", properties: {} }
    }
  }));
}

/** Earlier calls, written back as the block the tools prompt asks for. */
export function toolCallText(calls: ToolCall[]): string {
  const body = calls.map((call) => ({ name: call.name, arguments: call.args }));
  return `${OPEN}${JSON.stringify(body)}</tool_call>`;
}

/** The instructions that list the tools and the call format. */
export function toolsPromptSection(tools: ToolSpec[]): string {
  const lines = tools.map((tool) => JSON.stringify(tool.function));
  return [
    "You can call these tools:",
    "<tools>",
    ...lines,
    "</tools>",
    "",
    "To call tools, reply with only this block, with one object per call:",
    '<tool_call>[{"name": "tool_name", "arguments": {"argument": "value"}}]</tool_call>',
    "Answer in plain text when you need no tool.",
    "When a tool result answers the question, answer in plain text and do not call the tool again."
  ].join("\n");
}

type JsonObject = ToolCall["args"];

/** Parse JSON text holding one object or an array of objects, else null. */
function parseObjects(text: string): JsonObject[] | null {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.length > 0 && list.every(isRecord) ? list : null;
}

/** Read the calls out of one `<tool_call>` body, or null when it is not JSON calls. */
function parseBlock(body: string): ToolCall[] | null {
  const entries = parseObjects(body.trim());
  if (!entries) {
    return null;
  }
  const calls: ToolCall[] = [];
  for (const entry of entries) {
    if (!isNonEmptyString(entry.name)) {
      return null;
    }
    // Models write `arguments` as an object or as JSON text, and some write
    // `parameters` instead.
    const raw = entry.arguments ?? entry.parameters ?? {};
    const parsedArgs = isString(raw) ? parseObjects(raw) : null;
    const args = parsedArgs?.length === 1 ? parsedArgs[0] : raw;
    if (!isRecord(args)) {
      return null;
    }
    calls.push({ id: `call_${randomUUID().replace(/-/g, "")}`, name: entry.name, args });
  }
  return calls;
}

export interface ParsedOutput {
  /** The text with every parsed `<tool_call>` block removed. */
  content: string;
  toolCalls: ToolCall[];
}

/**
 * Split model output into text and tool calls. A block whose body is not valid
 * JSON calls stays in the text, so a malformed call is visible, not lost. An
 * unclosed block at the end counts: generation often stops on the end token
 * before the closing tag. A web chat may put the block in a code fence, which
 * is removed with it.
 */
export function parseToolCalls(output: string): ParsedOutput {
  const toolCalls: ToolCall[] = [];
  const replaced = output.replace(
    /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g,
    (block, body: string) => {
      const calls = parseBlock(body);
      if (!calls) {
        return block;
      }
      toolCalls.push(...calls);
      return "";
    }
  );
  const content = toolCalls.length > 0 ? replaced.replace(/```[\w-]*\s*```/g, "") : replaced;
  return { content, toolCalls };
}

/**
 * Pass streamed text through until a `<tool_call>` starts, so the call JSON
 * never reaches the chat as text. Text that could be the start of the tag is
 * held until the next token decides it.
 */
export class ToolCallTextFilter {
  private raw = "";
  private pending = "";
  private inCall = false;

  /** Add a token and return the text that is safe to show. */
  push(text: string): string {
    this.raw += text;
    if (this.inCall) {
      return "";
    }
    this.pending += text;
    const start = this.pending.indexOf(OPEN);
    if (start >= 0) {
      const shown = this.pending.slice(0, start);
      this.pending = "";
      this.inCall = true;
      return shown;
    }
    let keep = 0;
    for (let k = Math.min(OPEN.length - 1, this.pending.length); k > 0; k--) {
      if (OPEN.startsWith(this.pending.slice(-k))) {
        keep = k;
        break;
      }
    }
    const shown = this.pending.slice(0, this.pending.length - keep);
    this.pending = this.pending.slice(this.pending.length - keep);
    return shown;
  }

  /** The held text once the stream has ended. */
  flush(): string {
    const shown = this.inCall ? "" : this.pending;
    this.pending = "";
    return shown;
  }

  /** Everything the model wrote. */
  get output(): string {
    return this.raw;
  }
}
