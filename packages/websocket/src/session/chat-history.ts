import type { Message } from "@nodetool-ai/models";
import type {
  MessageContent,
  Message as ProviderMessage,
  ToolCall as ProviderToolCall
} from "@nodetool-ai/runtime";
import { isRecord, isString } from "../lib/wire-values.js";
import {
  findInvokedSkillNames,
  formatInvokedSkillsForPrompt
} from "@nodetool-ai/agents";
import { resolveContentForProvider } from "../resolve-media-urls.js";

/**
 * Turning a chat turn's stored history into what a provider is handed, and
 * turning a run's outputs back into message content.
 *
 * Everything here is a value-in/value-out conversion: no socket, no database,
 * no connection state. `ChatTurnHandler` is the only caller that has those.
 */

/** What the prompt needs from a skill, whichever tier it came from. */
export interface SkillEntry {
  name: string;
  description: string;
  content: string;
}

export function dbMessageToProviderMessage(
  m: Message,
  connectionUserId: string | null
): ProviderMessage | null {
  const role = m.role as ProviderMessage["role"];
  // Filter out non-standard roles (e.g. "agent_execution") that providers can't handle
  if (!role || !["user", "assistant", "system", "tool"].includes(role)) {
    return null;
  }
  const rawContent = Array.isArray(m.content)
    ? (resolveContentForProvider(
        m.content as unknown[],
        (m.user_id as string | undefined) ?? connectionUserId ?? undefined
      ) as MessageContent[])
    : (m.content as string | null);
  return {
    role,
    content: rawContent ?? "",
    toolCallId: isString(m.tool_call_id) ? m.tool_call_id : null,
    toolCalls: Array.isArray(m.tool_calls)
      ? (m.tool_calls as Array<ProviderToolCall>).map((tc) => {
          const call: ProviderToolCall = {
            id: tc.id,
            name: tc.name,
            args: tc.args
          };
          if (isString(tc.thought_signature)) {
            call.thought_signature = tc.thought_signature;
          }
          return call;
        })
      : null,
    threadId: m.thread_id
  };
}

/**
 * The displayable text for a tool result that may be image content. Used for
 * the persisted/echoed tool message so chat history stays a light note
 * instead of a base64 blob (the image only rides the in-flight provider
 * message for the turn that captured it).
 */
export function toolResultDisplayText(content: MessageContent[]): string {
  const text = content
    .filter(
      (c): c is MessageContent & { type: "text"; text: string } =>
        c.type === "text"
    )
    .map((c) => c.text)
    .join("\n");
  return text || "[image result]";
}

/**
 * Append ephemeral context to the last user message.
 *
 * Every turn-scoped block (RAG context, memory, an invoked skill's
 * body) rides here, and the position is the point. Providers cache the
 * longest stable prefix on their own, and Anthropic and the OpenAI Responses
 * API hoist *every* system-role message into one system string — so a block
 * that changes per turn, injected as a system message, rewrote the tail of
 * that string and invalidated the whole prefix ahead of the conversation,
 * tool catalog included. Folded into the last user message instead, the
 * volatile bytes sit after everything a later turn will reuse.
 *
 * Call it after media resolution: the text is appended as-is, so an
 * `asset://` uri a memory carries stays a reference instead of being
 * inlined as a data URI.
 */
export function appendContextToLastUser(
  messages: ProviderMessage[],
  context: string
): ProviderMessage[] {
  let lastUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIndex = i;
      break;
    }
  }
  if (lastUserIndex < 0) return messages;
  const target = messages[lastUserIndex];
  const appended: ProviderMessage = Array.isArray(target.content)
    ? {
        ...target,
        content: [...target.content, { type: "text", text: context }]
      }
    : {
        ...target,
        content: `${isString(target.content) ? target.content : ""}\n\n${context}`
      };
  return [
    ...messages.slice(0, lastUserIndex),
    appended,
    ...messages.slice(lastUserIndex + 1)
  ];
}

/** The bodies of the skills this turn's message named with `/<name>`. */
export function invokedSkillsSection(
  skills: readonly SkillEntry[],
  userText: string
): string {
  const invoked = findInvokedSkillNames(
    userText,
    skills.map((skill) => skill.name)
  );
  if (invoked.length === 0) return "";
  return formatInvokedSkillsForPrompt(
    skills
      .filter((skill) => invoked.includes(skill.name.toLowerCase()))
      .map((skill) => ({
        name: skill.name,
        description: skill.description,
        content: skill.content
      }))
  );
}

/**
 * Convert workflow result dict into a response message with typed content.
 * Mirrors Python's WorkflowMessageProcessor._create_response_message().
 *
 * Converts outputs to MessageContent items:
 *  - string → { type: "text", text }
 *  - list → { type: "text", text: joined }
 *  - dict with type "image"/"video"/"audio" → media content
 *  - other → { type: "text", text: stringified }
 */
export function createWorkflowResponseContent(
  result: Record<string, unknown>
): Array<Record<string, unknown>> {
  const content: Array<Record<string, unknown>> = [];

  for (const [, value] of Object.entries(result)) {
    if (value === null || value === undefined) continue;

    if (isString(value)) {
      content.push({ type: "text", text: value });
    } else if (Array.isArray(value)) {
      content.push({ type: "text", text: value.map(String).join(" ") });
    } else if (isRecord(value)) {
      const obj = value as Record<string, unknown>;
      const assetType = isString(obj.type) ? obj.type : "";
      if (assetType === "image") {
        content.push({
          type: "image",
          image: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
        });
      } else if (assetType === "video") {
        content.push({
          type: "video",
          video: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
        });
      } else if (assetType === "audio") {
        content.push({
          type: "audio",
          audio: { uri: obj.uri, asset_id: obj.asset_id, data: obj.data }
        });
      } else {
        content.push({ type: "text", text: JSON.stringify(obj) });
      }
    } else {
      content.push({ type: "text", text: String(value) });
    }
  }

  if (content.length === 0) {
    content.push({ type: "text", text: "Workflow completed successfully." });
  }

  return content;
}

/**
 * Extract text from message content that may be a string or array of content items.
 * Mirrors Python's _extract_query_text / _extract_objective / _extract_text_content.
 */
export function extractTextContent(content: unknown, fallback = ""): string {
  if (isString(content)) return content;
  if (Array.isArray(content)) {
    const texts = (content as Array<Record<string, unknown>>)
      .filter((c) => c.type === "text" && isString(c.text))
      .map((c) => c.text as string);
    return texts.length > 0 ? texts.join(" ") : fallback;
  }
  return fallback;
}
