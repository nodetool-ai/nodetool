/**
 * Render a conversation as Markdown for the clipboard.
 *
 * The JSON dump this replaced pasted raw message objects — base64 media, tool
 * results, thought tags and all. This keeps what a person would paste into an
 * issue or a doc: who said what, links to the media, and one line per tool the
 * agent ran.
 */
import type { Message } from "../../../stores/ApiTypes";

/** One stored content block, in the union the server writes. */
type ContentBlock = Extract<Message["content"], unknown[]>[number];
import { parseThoughtContent, stripContextContent } from "./messageUtils";
import { isCompactionMessage } from "../message/CompactionCard";

/** A stored media reference, narrowed to the two fields that locate it. */
interface MediaLocator {
  uri?: string;
  asset_id?: string | null;
}

/**
 * Where the media lives: the direct URI when there is one, otherwise the
 * `asset://` identifier the server resolves.
 */
const mediaTarget = (ref: MediaLocator | null | undefined): string | null => {
  if (!ref) {
    return null;
  }
  if (ref.uri) {
    return ref.uri;
  }
  return ref.asset_id ? `asset://${ref.asset_id}` : null;
};

/** Message text without the thinking block or the injected editor context. */
const visibleText = (text: string): string => {
  const withoutContext = stripContextContent(text);
  const thought = parseThoughtContent(withoutContext);
  const body = thought
    ? `${thought.textBeforeThought}${thought.textAfterThought}`
    : withoutContext;
  return body.trim();
};

const renderBlock = (block: ContentBlock): string | null => {
  switch (block.type) {
    case "text": {
      const text = visibleText(block.text);
      return text.length > 0 ? text : null;
    }
    case "image_url": {
      const target = mediaTarget(block.image);
      return target ? `![image](${target})` : null;
    }
    case "video": {
      const target = mediaTarget(block.video);
      return target ? `[video](${target})` : null;
    }
    case "audio": {
      const target = mediaTarget(block.audio);
      return target ? `[audio](${target})` : null;
    }
    default:
      return null;
  }
};

const renderContent = (content: Message["content"]): string[] => {
  if (typeof content === "string") {
    const text = visibleText(content);
    return text.length > 0 ? [text] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  const parts: string[] = [];
  for (const block of content) {
    const rendered = renderBlock(block);
    if (rendered !== null) {
      parts.push(rendered);
    }
  }
  return parts;
};

const heading = (role: string): string | null => {
  if (role === "user") {
    return "## You";
  }
  if (role === "assistant") {
    return "## Assistant";
  }
  return null;
};

/** The conversation as Markdown. Returns "" when nothing is worth rendering. */
export const conversationToMarkdown = (messages: Message[]): string => {
  const sections: string[] = [];
  for (const message of messages) {
    if (isCompactionMessage(message)) {
      continue;
    }
    // `heading` is also the filter: tool results, agent-execution rows and
    // system turns have no heading and never reach the output.
    const title = heading(message.role);
    if (title === null) {
      continue;
    }
    const blocks = renderContent(message.content);
    const toolLines = (message.tool_calls ?? []).map(
      (call) => `- Ran \`${call.name}\``
    );
    if (toolLines.length > 0) {
      blocks.push(toolLines.join("\n"));
    }
    if (blocks.length === 0) {
      continue;
    }
    sections.push(`${title}\n\n${blocks.join("\n\n")}`);
  }
  return sections.join("\n\n");
};
