/**
 * @nodetool-ai/llm-nodes — LLM provider + agent node bundle.
 *
 * Classes from `openai.ts` and `gemini.ts` share one name
 * (`EmbeddingNode`), so we re-export those provider modules via subpath
 * exports (`@nodetool-ai/llm-nodes/openai`, `/gemini`, `/mistral`,
 * `/agents`) rather than the barrel. The barrel fully re-exports
 * everything else.
 */

export * from "./nodes/agents.js";
export * from "./nodes/agent-tool-hydration.js";
export * from "./nodes/generators.js";
export * from "./nodes/mistral.js";

// `openai.ts` and `gemini.ts` share the name `EmbeddingNode`; barrel
// callers get only the registration arrays. Use the `/openai` and
// `/gemini` subpath exports for the individual classes.
export { OPENAI_NODES } from "./nodes/openai.js";
export { GEMINI_NODES } from "./nodes/gemini.js";
