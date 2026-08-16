/**
 * The Gemini grounded-search backend behind the routed `web_search` capability.
 *
 * This is not a tool. `capabilities/web.ts` picks the first configured backend
 * and calls the function below; the model never sees a `google_grounded_search`
 * name, because choosing a search provider is the host's job, not the model's.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { isFunction, isString } from "../utils/type-guards.js";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

async function getGeminiApiKey(context?: ProcessingContext): Promise<string> {
  // Prefer the context's secretResolver (encrypted DB) over env vars so the
  // chat-cli + agent picks up keys configured via `nodetool secrets store`.
  const fromCtx =
    isFunction(context?.getSecret)
      ? await context.getSecret("GEMINI_API_KEY")
      : null;
  const key = fromCtx ?? process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

/**
 * Whether the Gemini grounded-search backend is usable: its API key is present
 * in the secret store or the environment. Configuration is decided here,
 * before any call — never by sniffing an error message afterwards.
 */
export async function geminiSearchConfigured(
  context: ProcessingContext
): Promise<boolean> {
  const fromCtx =
    isFunction(context?.getSecret)
      ? await context.getSecret("GEMINI_API_KEY")
      : null;
  return Boolean(fromCtx ?? process.env["GEMINI_API_KEY"]);
}

/** Search the web with Gemini's grounded-search tool. */
export async function googleGroundedSearch(
  context: ProcessingContext,
  params: { query?: unknown }
): Promise<{
  query?: string;
  results?: string[];
  sources?: Array<{ title: string; url: string }>;
  status?: string;
  error?: string;
}> {
  const query = params.query;
  if (!isString(query) || !query) {
    return { error: "Search query is required" };
  }

  try {
    const apiKey = await getGeminiApiKey(context);
    const url = `${GEMINI_API_BASE}/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const body = {
      contents: [{ role: "user", parts: [{ text: query }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { responseModalities: ["TEXT"] }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      return {
        error: `Gemini API error: ${response.status} ${response.statusText}`
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const candidates = data["candidates"] as
      | Array<Record<string, unknown>>
      | undefined;

    if (!candidates?.length) {
      return { error: "No response received from Gemini API" };
    }

    const candidate = candidates[0];
    const content = candidate["content"] as Record<string, unknown> | undefined;
    const parts = content?.["parts"] as
      | Array<Record<string, unknown>>
      | undefined;

    const results: string[] = [];
    if (parts) {
      for (const part of parts) {
        if (isString(part["text"])) {
          results.push(part["text"]);
        }
      }
    }

    const groundingMetadata = candidate["groundingMetadata"] as
      | Record<string, unknown>
      | undefined;
    const sources: Array<{ title: string; url: string }> = [];

    if (groundingMetadata) {
      const chunks = groundingMetadata["groundingChunks"] as
        | Array<Record<string, unknown>>
        | undefined;
      if (chunks) {
        for (const chunk of chunks) {
          const web = chunk["web"] as Record<string, unknown> | undefined;
          if (web?.["uri"]) {
            sources.push({
              title: String(web["title"] ?? "Unknown Source"),
              url: String(web["uri"])
            });
          }
        }
      }
    }

    return {
      query,
      results,
      sources,
      status: "success"
    };
  } catch (e) {
    return { error: `Google grounded search failed: ${String(e)}` };
  }
}
