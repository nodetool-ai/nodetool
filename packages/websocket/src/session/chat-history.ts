import {
  isCompactionMessage,
  turnContextText,
  type Message,
  type TurnContextSection
} from "@nodetool-ai/models";
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

/**
 * The rows a provider is sent: everything from the newest compaction record
 * onward, that record included.
 *
 * Compaction replaces the transcript before it with one summary row, so the
 * provider view starts there while the older rows stay in the database for the
 * UI and for `nodetool.threads.*`. The record is itself a `role: "user"`
 * message, so after the cut it is ordinary history and the prefix a provider
 * caches keeps growing from it (I-7).
 *
 * The cut therefore lands on a user-message boundary by construction, which is
 * what keeps an assistant's tool call and its result on the same side of it —
 * Anthropic rejects a `tool_use` with no `tool_result`. `rows` unchanged when
 * the thread has never been compacted.
 */
export function historySinceCompaction(rows: readonly Message[]): Message[] {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (isCompactionMessage(rows[i])) return rows.slice(i);
  }
  return [...rows];
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
    // An assistant turn that only called tools went out with `null` content
    // while it was live; replaying it as "" would change the bytes of a
    // request prefix the provider has cached.
    content: rawContent ?? (role === "assistant" ? null : ""),
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
 * The content of the image message a `view_image` result put after its round,
 * when it can be stored on the tool row: text blocks and images referenced by
 * a storage uri. Null for anything carrying bytes or a `data:` uri, which the
 * database does not hold. Such a row replays without its image, and the
 * request prefix after it changes once.
 */
export function storableViewedImage(
  content: readonly MessageContent[] | undefined
): MessageContent[] | null {
  if (!content || content.length === 0) return null;
  const storable = content.every((block) =>
    block.type === "text"
      ? isString(block.text)
      : block.type === "image_url" &&
        isString(block.image.uri) &&
        !block.image.uri.startsWith("data:") &&
        block.image.data === undefined
  );
  return storable ? [...content] : null;
}

/**
 * The image message a stored `view_image` row carries (see
 * {@link storableViewedImage}), shaped as the provider loop built it: role and
 * content only. Null for every other row.
 */
export function viewedImageMessage(row: Message): ProviderMessage | null {
  if (row.role !== "tool" || !Array.isArray(row.output_files)) return null;
  const content = storableViewedImage(row.output_files as MessageContent[]);
  return content ? { role: "user", content } : null;
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
 * A user message with its turn context appended: a text part on array
 * content, a blank line and the text on string content.
 *
 * Every turn-scoped block (what the user is looking at, the focused tools,
 * memory, an invoked skill's body) rides on the user message it was sent
 * with. Providers cache the longest stable prefix, and Anthropic and the
 * OpenAI Responses API hoist every system-role message into one system
 * string, so a per-turn block in a system message rewrote that string and
 * invalidated the whole prefix. On the user message the block sits after
 * everything earlier turns sent. The block is stored on that message
 * (`turn_context`) and replayed through this function on every later turn,
 * so the bytes a provider cached are sent again unchanged.
 *
 * Call it after media resolution: the text is appended as-is, so an
 * `asset://` uri a memory carries stays a reference instead of being
 * inlined as a data URI.
 */
export function appendTurnContext(
  message: ProviderMessage,
  context: string
): ProviderMessage {
  if (!context) return message;
  return Array.isArray(message.content)
    ? { ...message, content: [...message.content, { type: "text", text: context }] }
    : {
        ...message,
        content: `${isString(message.content) ? message.content : ""}\n\n${context}`
      };
}

/** {@link appendTurnContext} on the last user message of `messages`. */
export function appendContextToLastUser(
  messages: ProviderMessage[],
  context: string
): ProviderMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    return [
      ...messages.slice(0, i),
      appendTurnContext(messages[i], context),
      ...messages.slice(i + 1)
    ];
  }
  return messages;
}

/** One block a turn would send, before it is compared with what was sent. */
export interface TurnContextCandidate {
  key: string;
  /** The block for this turn; empty when the turn has none of this kind. */
  text: string;
  /**
   * Sent in place of an empty `text` when the thread last sent a non-empty
   * block of this kind, so the model does not act on a stale one, such as a
   * document the user has since closed. Omit it for kinds whose earlier block
   * stays true.
   */
  cleared?: string;
}

/**
 * The newest text of every turn-context kind in `rows`, oldest row first.
 * `rows` is the history a provider is sent, so a block cut by compaction no
 * longer counts as sent.
 */
export function lastSentTurnContext(
  rows: readonly Message[]
): Map<string, string> {
  const sent = new Map<string, string>();
  for (const row of rows) {
    for (const section of row.turn_context ?? []) {
      sent.set(section.key, section.text);
    }
  }
  return sent;
}

/**
 * The blocks this turn sends: each candidate whose text differs from the one
 * the thread last sent for its kind (I3). An unchanged block is already in
 * the history, so sending it again would only grow the prompt.
 */
export function turnContextDelta(
  candidates: readonly TurnContextCandidate[],
  lastSent: ReadonlyMap<string, string>
): TurnContextSection[] {
  const out: TurnContextSection[] = [];
  for (const { key, text, cleared } of candidates) {
    const previous = lastSent.get(key);
    if (text) {
      if (text !== previous) out.push({ key, text });
      continue;
    }
    if (cleared && previous && previous !== cleared) {
      out.push({ key, text: cleared });
    }
  }
  return out;
}

export { turnContextText };

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
