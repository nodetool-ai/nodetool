/**
 * Chat template rendering for Transformers.js tool calls. A chat template that
 * renders `tools` itself (Qwen, Llama 3.x, Hermes) gets them as the template
 * variable. A template without tool support (SmolLM2) gets the shared tools
 * prompt from the runtime in its system message. Both get `<tool_call>`
 * blocks back, which the runtime's `parseToolCalls` reads.
 */

import {
  toolCallText,
  toolsPromptSection,
  type Message,
  type ToolCall,
  type ToolSpec
} from "@nodetool-ai/runtime";

/** One message in the shape chat templates read. */
export interface TemplateMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    type: "function";
    function: { name: string; arguments: ToolCall["args"] };
  }>;
}

export interface ChatTemplateOptions {
  tools?: ToolSpec[];
  tokenize: false;
  add_generation_prompt: true;
  /** Read by Qwen3's template. Other templates ignore it. */
  enable_thinking?: false;
}

/** The part of a Transformers.js tokenizer that renders chat prompts. */
export interface ChatTokenizer {
  apply_chat_template(conversation: TemplateMessage[], options: ChatTemplateOptions): string;
  get_chat_template?(options: { tools?: ToolSpec[] }): string;
}

/** Whether the model's chat template renders the `tools` variable itself. */
export function templateSupportsTools(
  tokenizer: ChatTokenizer,
  tools: ToolSpec[]
): boolean {
  if (!tokenizer.get_chat_template) {
    return false;
  }
  try {
    return /\btools\b/.test(tokenizer.get_chat_template({ tools }));
  } catch {
    // No chat template at all: apply_chat_template reports that later.
    return false;
  }
}

export function messageText(content: Message["content"]): string {
  if (content == null) {
    return "";
  }
  if (Array.isArray(content)) {
    return content
      .filter((c) => c?.type === "text")
      .map((c) => c.text)
      .join("");
  }
  return content;
}

/**
 * How a template without tool support receives a tool result. `tool` is a
 * message with that role: small models trained on single-shot calls answer
 * from it, where they repeat the call after a user message. `user` is for a
 * template that rejects roles it does not know.
 */
export type ToolResultRole = "tool" | "user";

/**
 * Convert NodeTool messages for the chat template. With `native`, tool calls
 * and results use the template's own fields. Without it, calls become the
 * `<tool_call>` text the tools prompt describes, results take
 * `toolResultRole`, and the prompt joins the system message.
 */
export function toTemplateMessages(
  messages: Message[],
  tools: ToolSpec[],
  native: boolean,
  toolResultRole: ToolResultRole = "tool"
): TemplateMessage[] {
  const out: TemplateMessage[] = [];
  const callNames = new Map<string, string>();
  for (const m of messages) {
    const text = messageText(m.content);
    if (m.role === "tool") {
      const name = (m.toolCallId && callNames.get(m.toolCallId)) || "the tool";
      out.push(
        native || toolResultRole === "tool"
          ? { role: "tool", content: text }
          : { role: "user", content: `Result of ${name}:\n${text}` }
      );
      continue;
    }
    for (const call of m.toolCalls ?? []) {
      callNames.set(call.id, call.name);
    }
    const calls = m.role === "assistant" ? (m.toolCalls ?? []) : [];
    if (calls.length === 0) {
      out.push({ role: m.role, content: text });
    } else if (native) {
      out.push({
        role: "assistant",
        content: text,
        tool_calls: calls.map((call) => ({
          type: "function",
          function: { name: call.name, arguments: call.args }
        }))
      });
    } else {
      const block = toolCallText(calls);
      out.push({ role: "assistant", content: text ? `${text}\n${block}` : block });
    }
  }
  if (native || tools.length === 0) {
    return out;
  }
  const section = toolsPromptSection(tools);
  const first = out[0];
  if (first?.role === "system") {
    out[0] = { role: "system", content: `${first.content}\n\n${section}` };
  } else {
    out.unshift({ role: "system", content: section });
  }
  return out;
}
