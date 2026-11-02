import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { AGENT_NODES } from "./nodes/agents.js";
import { GENERATOR_NODES } from "./nodes/generators.js";
import { DIRECTOR_NODES } from "./nodes/director.js";
import { SHOTS_NODES } from "./nodes/shots.js";
import { GEMINI_NODES } from "./nodes/gemini.js";
import { MISTRAL_NODES } from "./nodes/mistral.js";
import { OPENAI_NODES } from "./nodes/openai.js";
import { XAI_NODES } from "./nodes/xai.js";
import { CODEX_NODES } from "./nodes/codex.js";
import { ANTHROPIC_NODES, CLAUDE_CODE_NODES } from "./nodes/anthropic.js";

/**
 * @nodetool-ai/llm-nodes — LLM provider + agent node bundle.
 *
 * Classes from `openai.ts`, `gemini.ts` and `xai.ts` share names with
 * each other and with `mistral.ts` (e.g. `EmbeddingNode`,
 * `ChatComplete`, `ImageToText`), so we re-export those provider modules
 * via subpath exports (`@nodetool-ai/llm-nodes/openai`, `/gemini`,
 * `/mistral`, `/xai`, `/agents`) rather than the barrel. The barrel fully
 * re-exports everything else.
 */

export * from "./nodes/agents.js";
export * from "./nodes/agent-tool-hydration.js";
export * from "./nodes/generators.js";
export * from "./nodes/mistral.js";
export * from "./nodes/codex.js";
export * from "./nodes/anthropic.js";

// `openai.ts`, `gemini.ts` and `xai.ts` reuse class names (`EmbeddingNode`,
// `ChatComplete`, `ImageToText`); barrel callers get only the registration
// arrays. Use the `/openai`, `/gemini` and `/xai` subpath exports for the
// individual classes.
export { OPENAI_NODES } from "./nodes/openai.js";
export { GEMINI_NODES } from "./nodes/gemini.js";
export { XAI_NODES } from "./nodes/xai.js";

export const ALL_LLM_NODES: readonly NodeClass[] = [
  ...AGENT_NODES,
  ...GENERATOR_NODES,
  ...DIRECTOR_NODES,
  ...SHOTS_NODES,
  ...GEMINI_NODES,
  ...MISTRAL_NODES,
  ...OPENAI_NODES,
  ...XAI_NODES,
  ...CODEX_NODES,
  ...ANTHROPIC_NODES,
  ...CLAUDE_CODE_NODES,
];

export function registerLlmNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_LLM_NODES) {
    registry.register(nodeClass);
  }
}
