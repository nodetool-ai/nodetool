/**
 * How many input tokens a provider route accepts for one model.
 *
 * Chat compaction fires at a fraction of this number, so a wrong answer is a
 * thread that either compacts far too early (a 1M window treated as 200k) or
 * never compacts before the provider refuses it. The sources, most trusted
 * first:
 *
 * 1. The provider's own Models API ({@link BaseProvider.getContextWindow}),
 *    e.g. Anthropic's `max_input_tokens`, which also reflects the betas the
 *    provider sends with every request.
 * 2. models.dev, keyed by provider route and model. The same model has
 *    different limits on different routes, so a model id alone is never
 *    looked up across providers.
 * 3. {@link CONTEXT_WINDOW_FALLBACK}, logged as a warning, when neither knows.
 */

import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { BaseProvider } from "./base-provider.js";

const log = createLogger("nodetool.runtime.providers.context-window");

/**
 * Window assumed when no source knows the model. Conservative on purpose: an
 * early compaction costs one summarizer call, a late one costs the turn.
 */
export const CONTEXT_WINDOW_FALLBACK = 128_000;

export const MODELS_DEV_URL = "https://models.dev/api.json";

/** How long a fetched catalog is trusted before it is fetched again. */
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
/** How long a failed fetch is remembered, so an offline machine is not retried every turn. */
const CATALOG_FAILURE_TTL_MS = 10 * 60 * 1000;
const CATALOG_TIMEOUT_MS = 5_000;

/**
 * NodeTool provider id → models.dev provider key, for the ids that differ or
 * that models.dev lists. A provider missing here has no route entry there
 * (local runtimes, NodeTool's own managed models) and falls through.
 */
const MODELS_DEV_PROVIDER: Readonly<Record<string, string>> = {
  [PROVIDER_IDS.OPENAI]: "openai",
  [PROVIDER_IDS.ANTHROPIC]: "anthropic",
  [PROVIDER_IDS.GEMINI]: "google",
  [PROVIDER_IDS.GROQ]: "groq",
  [PROVIDER_IDS.MISTRAL]: "mistral",
  [PROVIDER_IDS.MOONSHOT]: "moonshotai",
  [PROVIDER_IDS.MINIMAX]: "minimax",
  [PROVIDER_IDS.DEEPSEEK]: "deepseek",
  [PROVIDER_IDS.XAI]: "xai",
  [PROVIDER_IDS.COHERE]: "cohere",
  [PROVIDER_IDS.OPENROUTER]: "openrouter",
  [PROVIDER_IDS.TOGETHER]: "togetherai",
  [PROVIDER_IDS.ALIBABA]: "alibaba",
  [PROVIDER_IDS.CEREBRAS]: "cerebras",
  [PROVIDER_IDS.META]: "llama",
  [PROVIDER_IDS.HUGGINGFACE]: "huggingface"
};

interface ModelsDevModel {
  limit?: { context?: number; input?: number; output?: number };
}
type ModelsDevCatalog = Record<
  string,
  { models?: Record<string, ModelsDevModel> }
>;

let catalogCache: {
  catalog: ModelsDevCatalog | null;
  expires: number;
} | null = null;
let catalogInFlight: Promise<ModelsDevCatalog | null> | null = null;

/** Drop the cached models.dev catalog. Tests use it between cases. */
export function resetModelsDevCache(): void {
  catalogCache = null;
  catalogInFlight = null;
}

async function loadModelsDevCatalog(
  fetchFn: typeof fetch
): Promise<ModelsDevCatalog | null> {
  if (catalogCache && catalogCache.expires > Date.now()) {
    return catalogCache.catalog;
  }
  if (catalogInFlight) return catalogInFlight;
  catalogInFlight = (async () => {
    try {
      const response = await fetchFn(MODELS_DEV_URL, {
        signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const catalog = (await response.json()) as ModelsDevCatalog;
      catalogCache = { catalog, expires: Date.now() + CATALOG_TTL_MS };
      return catalog;
    } catch (err) {
      log.warn("models.dev catalog unavailable", {
        error: err instanceof Error ? err.message : String(err)
      });
      catalogCache = {
        catalog: null,
        expires: Date.now() + CATALOG_FAILURE_TTL_MS
      };
      return null;
    } finally {
      catalogInFlight = null;
    }
  })();
  return catalogInFlight;
}

/** A positive integer token count, or null for anything else. */
function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

/**
 * The input limit models.dev lists for one model on one provider route, or
 * null. `limit.input` is preferred over `limit.context` because a route that
 * reserves part of the window for output lists the smaller number as input.
 */
export async function modelsDevContextWindow(
  providerId: string,
  model: string,
  fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<number | null> {
  const route = MODELS_DEV_PROVIDER[providerId];
  if (!route) return null;
  const catalog = await loadModelsDevCatalog(fetchFn);
  const models = catalog?.[route]?.models;
  if (!models) return null;
  const entry = models[model] ?? models[model.replace(/^models\//, "")];
  return tokenCount(entry?.limit?.input) ?? tokenCount(entry?.limit?.context);
}

export type ContextWindowSource = "provider" | "models.dev" | "fallback";

export interface ContextWindow {
  tokens: number;
  source: ContextWindowSource;
}

/**
 * Resolve the input window for `model` on `provider`. Never throws: every
 * source is best-effort, and the last one is a constant.
 */
export async function resolveContextWindow(
  provider: BaseProvider,
  model: string,
  options: { fetchFn?: typeof fetch } = {}
): Promise<ContextWindow> {
  try {
    const fromProvider = tokenCount(await provider.getContextWindow(model));
    if (fromProvider !== null) {
      return { tokens: fromProvider, source: "provider" };
    }
  } catch (err) {
    log.debug("Provider context window lookup failed", {
      provider: provider.provider,
      model,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  const fromCatalog = await modelsDevContextWindow(
    provider.provider,
    model,
    options.fetchFn
  );
  if (fromCatalog !== null) {
    return { tokens: fromCatalog, source: "models.dev" };
  }
  log.warn("Context window unknown; assuming the fallback", {
    provider: provider.provider,
    model,
    tokens: CONTEXT_WINDOW_FALLBACK
  });
  return { tokens: CONTEXT_WINDOW_FALLBACK, source: "fallback" };
}
