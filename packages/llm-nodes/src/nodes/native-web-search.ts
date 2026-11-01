import {
  WEB_SEARCH_TOOL_NAME,
  isProviderMessageEvent,
  type Message,
  type ProcessingContext
} from "@nodetool-ai/runtime";
import { isString } from "@nodetool-ai/node-sdk";

/** A page an answer cites. */
export type WebSource = { title: string; url: string };

/** What a web search node emits. */
export type WebSearchOutputs = { text: string; sources: WebSource[] };

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
  if (isString(content)) return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" && isString(part.text) ? part.text : ""))
    .join("");
}

function messageSources(message: Message): WebSource[] {
  const content = message.content;
  if (!Array.isArray(content)) return [];
  const sources: WebSource[] = [];
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

/**
 * Answer a query with a provider's own web search: Anthropic's server-side
 * web search tool, or the Claude Code CLI's `WebSearch`. The canonical
 * `web_search` tool is offered and the provider swaps in its native search,
 * so nothing runs client-side. The answer is the last assistant turn.
 */
export async function runNativeWebSearch(
  context: ProcessingContext | undefined,
  providerId: string,
  model: string,
  query: string
): Promise<WebSearchOutputs> {
  if (!query.trim()) throw new Error("Search query cannot be empty");
  if (!model) throw new Error("Select a model");
  if (!context) throw new Error("Web search needs a processing context");
  const provider = await context.getProvider(providerId);
  if (!provider.supportsNativeWebSearch) {
    throw new Error(`${providerId} has no built-in web search`);
  }

  let streamed = "";
  let answer = "";
  let sources: WebSource[] = [];
  for await (const item of provider.generateLoop({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: query }
    ],
    model,
    tools: [WEB_SEARCH_TOOL],
    maxIterations: 8,
    signal: context.signal
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
      isString(item.content)
    ) {
      streamed += item.content;
    }
  }

  const text = answer || streamed;
  if (!text) throw new Error("Web search returned no answer");
  return { text, sources };
}
