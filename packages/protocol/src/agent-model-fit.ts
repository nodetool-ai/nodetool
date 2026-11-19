/**
 * How well a language model is expected to work for agent runs, which call
 * NodeTool's tools on every step.
 *
 * The verdicts come from what NodeTool knows without running the model:
 *
 * - `no_tools`: the provider says the model cannot call tools, so an agent
 *   cannot use it at all.
 * - `free_tier`: an OpenRouter `:free` route. OpenRouter rate limits these
 *   routes per minute and per day, and a long agent run hits those limits.
 * - `default`: NodeTool's own default chat model for that provider, and the
 *   model the agent eval workflows run against by default. This is not a
 *   benchmark result: no per-task reliability has been recorded for it.
 * - `unknown`: everything else. The model may work well. NodeTool has no
 *   evidence either way.
 */

export type AgentModelFit = "no_tools" | "free_tier" | "default" | "unknown";

export interface AgentModelFitInput {
  id: string;
  provider: string;
  supports_tools?: boolean | null;
}

/**
 * Model ids NodeTool uses as defaults for agent work. Matched on the id's
 * last path segment, so `anthropic/claude-sonnet-5` on a router matches too.
 * Each entry names where the default is set, so the list can be checked.
 */
export const AGENT_DEFAULT_MODELS: ReadonlyArray<{
  id: string;
  source: string;
}> = [
  {
    id: "claude-sonnet-5-5",
    source: "RECOMMENDED_MODELS in packages/runtime"
  },
  {
    id: "gpt-6.2",
    source: "RECOMMENDED_MODELS in packages/runtime"
  },
  {
    id: "gemini-4-neon-preview",
    source: "RECOMMENDED_MODELS in packages/runtime"
  },
  {
    id: "claude-sonnet-5",
    source:
      "Default model of .github/workflows/agent-eval.yml and app-build-eval.yml"
  },
  {
    id: "gpt-5.4-mini",
    source: "Language model fixture of the CodeAct API eval (packages/agents/src/evals/codeact-api-core.ts)"
  }
];

const DEFAULT_IDS = new Set(AGENT_DEFAULT_MODELS.map((entry) => entry.id));

function lastSegment(id: string): string {
  const slash = id.lastIndexOf("/");
  return (slash >= 0 ? id.slice(slash + 1) : id).toLowerCase();
}

/** Whether `id` is an OpenRouter free route, such as `meta-llama/llama-3.3-70b-instruct:free`. */
export function isOpenRouterFreeRoute(provider: string, id: string): boolean {
  return provider === "openrouter" && id.toLowerCase().endsWith(":free");
}

export function agentModelFit(model: AgentModelFitInput): AgentModelFit {
  if (model.supports_tools === false) return "no_tools";
  if (isOpenRouterFreeRoute(model.provider, model.id)) return "free_tier";
  if (DEFAULT_IDS.has(lastSegment(model.id))) return "default";
  return "unknown";
}
