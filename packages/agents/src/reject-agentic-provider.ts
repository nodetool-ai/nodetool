/**
 * Agent orchestration (TaskPlanner, StepExecutor) runs its OWN tool-calling
 * loop: it streams an LLM call, collects tool_use items from the stream,
 * executes the tools in-process, and appends tool_result messages before the
 * next call. This is the only pattern that cleanly supports per-tool-call
 * validation, streaming task updates, and bounded retries.
 *
 * "Agent-harness" providers (e.g. Claude Agent SDK) drive their OWN internal
 * tool loop inside a single call, gated by a provider-specific `maxTurns`.
 * They expect tools to be registered as MCP tools via onToolCall, hiding the
 * tool_use / tool_result exchange from the caller. That's incompatible with
 * our orchestration model — we can't inspect per-call state, enforce our own
 * retry budgets, or yield incremental task updates.
 *
 * Reject those providers at the edge so users get a clear error pointing at
 * the fix (use the direct-API provider like `anthropic` instead).
 */

import type { BaseProvider } from "@nodetool/runtime";

const AGENTIC_PROVIDER_IDS = new Set(["claude_agent"]);

export function isAgenticProvider(provider: BaseProvider): boolean {
  const id = (provider as unknown as { provider?: string }).provider;
  return typeof id === "string" && AGENTIC_PROVIDER_IDS.has(id);
}

export function rejectAgenticProvider(
  provider: BaseProvider,
  caller: string
): void {
  if (!isAgenticProvider(provider)) return;
  const id = (provider as unknown as { provider?: string }).provider;
  throw new Error(
    `${caller} does not support the '${id}' provider. ` +
      `Agent orchestration drives its own tool-calling loop and requires ` +
      `a direct-API provider (e.g. 'anthropic', 'openai', 'gemini'). ` +
      `Switch provider with --provider anthropic (same models available).`
  );
}
