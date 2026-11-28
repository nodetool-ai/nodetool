/**
 * Answer a query with a provider's own web search: Anthropic's server-side
 * web search tool, or the Claude Code CLI's `WebSearch`. The canonical
 * `web_search` tool is offered and the provider swaps in its native search,
 * so nothing runs client-side. The answer is the last assistant turn.
 *
 * The `claude_code.text.WebSearch` and `anthropic.text.WebSearch` nodes and
 * the agents' `claude` search backend share this one implementation.
 */

import type { BaseProvider } from "./base-provider.js";
import {
  WEB_SEARCH_TOOL_NAME,
  isProviderMessageEvent,
  type Message
} from "./types.js";

/** A page an answer cites. */
export type NativeWebSource = { title: string; url: string };

/** A native web search's answer and the pages it cites. */
export type NativeWebSearchResult = { text: string; sources: NativeWebSource[] };

const WEB_SEARCH_TOOL = {
  name: WEB_SEARCH_TOOL_NAME,
  description: "Search the web for current information.",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"]
  }
};

const SYSTEM_PROMPT =
  "Search the web to answer the user's query from current information. Cite the pages you used.";

function messageText(message: Message): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part.type === "text" && typeof part.text === "string" ? part.text : ""
    )
    .join("");
}

function messageSources(message: Message): NativeWebSource[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const sources: NativeWebSource[] = [];
  for (const part of content) {
    if (part.type !== "text" || !Array.isArray(part.citations)) continue;
    for (const citation of part.citations) {
      if (citation.type !== "web_search_result_location") continue;
      if (!citation.url || sources.some((s) => s.url === citation.url)) continue;
      sources.push({ title: citation.title ?? citation.url, url: citation.url });
    }
  }
  return sources;
}

export async function runNativeWebSearch(
  provider: Pick<BaseProvider, "supportsNativeWebSearch" | "generateLoop" | "provider">,
  args: {
    model: string;
    query: string;
    signal?: AbortSignal;
    systemPrompt?: string;
  }
): Promise<NativeWebSearchResult> {
  if (!args.query.trim()) throw new Error("Search query cannot be empty");
  if (!args.model) throw new Error("Select a model");
  if (!provider.supportsNativeWebSearch) {
    throw new Error(`${provider.provider} has no built-in web search`);
  }

  let streamed = "";
  let answer = "";
  let sources: NativeWebSource[] = [];
  for await (const item of provider.generateLoop({
    messages: [
      { role: "system", content: args.systemPrompt ?? SYSTEM_PROMPT },
      { role: "user", content: args.query }
    ],
    model: args.model,
    tools: [WEB_SEARCH_TOOL],
    maxIterations: 8,
    webSearchOnly: true,
    signal: args.signal
  })) {
    if (isProviderMessageEvent(item)) {
      if (item.message.role !== "assistant") continue;
      const text = messageText(item.message);
      if (text) {
        answer = text;
        sources = messageSources(item.message);
      }
      continue;
    }
    if (
      "type" in item &&
      item.type === "chunk" &&
      !item.thinking &&
      typeof item.content === "string"
    ) {
      streamed += item.content;
    }
  }

  const text = answer || streamed;
  if (!text) throw new Error("Web search returned no answer");
  return { text, sources };
}
