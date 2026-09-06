/**
 * How a NodeTool provider id maps onto `@pydantic/genai-prices`, and which
 * providers cost nothing because they run on the user's own machine.
 *
 * One table, two readers: the server-side `CostCalculator` prices a finished
 * run from it, and the web setup flow prices a run before it starts. Each held
 * its own copy, which is a table that drifts — the next alias gets added to one
 * of them, and the same model is then free on one surface and priced on the
 * other.
 *
 * It lives in `protocol` rather than in `model-pricing` because the calculator
 * is in `runtime`, and `model-pricing` depends on `runtime` through `node-sdk`;
 * a table there would be a dependency cycle. Data only: no catalog, nothing
 * from Node, so a browser bundle reads it as happily as the server does.
 */

/**
 * NodeTool provider id → genai-prices provider id. A provider absent here
 * falls back to genai-prices' own model-name matching (`providerId` omitted),
 * so this table carries only the ids whose names differ.
 */
export const GENAI_PROVIDER_MAP: Readonly<Record<string, string>> = {
  openai: "openai",
  anthropic: "anthropic",
  claude_agent_sdk: "anthropic",
  "claude-agent-sdk": "anthropic",
  gemini: "google",
  google: "google",
  mistral: "mistral",
  groq: "groq",
  deepseek: "deepseek",
  xai: "x-ai",
  grok: "x-ai",
  moonshot: "moonshotai",
  moonshotai: "moonshotai"
};

/** Providers that run locally and incur no API cost. */
export const LOCAL_FREE_PROVIDERS: ReadonlySet<string> = new Set([
  "ollama",
  "local",
  "lmstudio",
  "llama_cpp",
  "llamacpp",
  "llama-cpp"
]);

/** True when a run on this provider costs the user nothing. Case-insensitive. */
export const isLocalFreeProvider = (provider: string): boolean =>
  LOCAL_FREE_PROVIDERS.has(provider.toLowerCase());

/**
 * The genai-prices provider id for a NodeTool provider, or undefined when the
 * catalog should match on the model name alone.
 */
export const genaiProviderId = (provider: string): string | undefined =>
  GENAI_PROVIDER_MAP[provider];
