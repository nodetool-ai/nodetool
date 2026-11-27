/**
 * Claude Code web search as a SERP provider.
 *
 * The Claude Code CLI (`claude`) has a built-in `WebSearch` tool and runs on
 * the machine's Claude Pro or Max sign-in. `runNativeWebSearch` in
 * `@nodetool-ai/runtime` offers the canonical `web_search` tool to
 * `ClaudeAgentProvider`, which swaps in the CLI's own search. The CLI returns
 * prose without structured citations, so the pages are read from the links in
 * the answer, which the prompt asks for.
 */

import type { SerpProvider, SearchResult, SearchOptions } from "./index.js";
import {
  linksInAnswer,
  searchByAnswer,
  type ModelSearchAnswer
} from "./model-search.js";

/** The model the search runs on: the CLI resolves the alias. */
export const CLAUDE_SEARCH_MODEL = "sonnet";

const SYSTEM_PROMPT =
  "Search the web with your WebSearch tool to answer the user's query from " +
  "current information. Answer only from the pages the search returned. End " +
  "with a list of the pages you used, one Markdown link per line, as " +
  "[title](url). Never list a URL the search did not return.";

/** The part of a native-search runner a Claude search needs. */
export type ClaudeSearchRunner = (args: {
  query: string;
  model: string;
  systemPrompt: string;
  signal?: AbortSignal;
}) => Promise<{ text: string; sources: ReadonlyArray<{ title: string; url: string }> }>;

/** Whether the Claude Code CLI can be found. */
export type ClaudeCliCheck = () => Promise<boolean>;

async function defaultRunner(cliPath: string | null): Promise<ClaudeSearchRunner> {
  const { ClaudeAgentProvider, runNativeWebSearch } = await import(
    "@nodetool-ai/runtime"
  );
  const provider = new ClaudeAgentProvider(
    cliPath ? { CLAUDE_CLI_PATH: cliPath } : {}
  );
  return ({ query, model, systemPrompt, signal }) =>
    runNativeWebSearch(provider, { query, model, systemPrompt, signal });
}

async function claudeCliFound(cliPath: string | null): Promise<boolean> {
  try {
    const { ClaudeAgentProvider } = await import("@nodetool-ai/runtime");
    await new ClaudeAgentProvider(
      cliPath ? { CLAUDE_CLI_PATH: cliPath } : {}
    ).resolveCliPath();
    return true;
  } catch {
    // Not installed, or CLAUDE_CLI_PATH names no executable.
    return false;
  }
}

/** How long a CLI lookup is reused, in milliseconds. */
const AVAILABILITY_TTL_MS = 60_000;

let availability: { at: number; key: string; value: Promise<boolean> } | null =
  null;

/**
 * Whether the Claude Code CLI is installed, at `CLAUDE_CLI_PATH` or on the
 * usual paths. Nothing is spawned. The answer is reused for a minute.
 */
export async function claudeSearchAvailable(
  cliPath: string | null
): Promise<boolean> {
  const key = cliPath ?? "";
  const now = Date.now();
  if (
    !availability ||
    availability.key !== key ||
    now - availability.at > AVAILABILITY_TTL_MS
  ) {
    availability = { at: now, key, value: claudeCliFound(cliPath) };
  }
  return availability.value;
}

/** Forget the cached CLI lookup, for tests. */
export function resetClaudeSearchAvailability(): void {
  availability = null;
}

export class ClaudeSearchProvider implements SerpProvider {
  private readonly runner: ClaudeSearchRunner | undefined;
  private readonly cliPath: string | null;
  private readonly model: string;

  constructor(
    options: {
      runner?: ClaudeSearchRunner;
      cliPath?: string | null;
      model?: string;
    } = {}
  ) {
    this.runner = options.runner;
    this.cliPath = options.cliPath ?? null;
    this.model = options.model ?? CLAUDE_SEARCH_MODEL;
  }

  /** Run one Claude Code search and read its answer and the pages it links. */
  async answer(
    query: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<ModelSearchAnswer> {
    const run = this.runner ?? (await defaultRunner(this.cliPath));
    const result = await run({
      query,
      model: this.model,
      systemPrompt: SYSTEM_PROMPT,
      signal: options.signal
    });
    const citations: SearchResult[] =
      result.sources.length > 0
        ? result.sources.map((s, i) => ({
            title: s.title,
            url: s.url,
            snippet: "",
            position: i + 1
          }))
        : linksInAnswer(result.text);
    return { text: result.text, citations, raw: result };
  }

  /**
   * The pages the answer used as a ranked result list. The search tool takes
   * no result count, so `numResults` truncates what came back.
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    return searchByAnswer(this, query, options?.numResults);
  }

  async searchRaw(query: string): Promise<unknown> {
    return (await this.answer(query)).raw;
  }
}
