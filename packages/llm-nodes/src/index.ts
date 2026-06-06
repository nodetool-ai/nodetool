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

// `openai.ts`, `gemini.ts` and `xai.ts` reuse class names (`EmbeddingNode`,
// `ChatComplete`, `ImageToText`); barrel callers get only the registration
// arrays. Use the `/openai`, `/gemini` and `/xai` subpath exports for the
// individual classes.
export { OPENAI_NODES } from "./nodes/openai.js";
export { GEMINI_NODES } from "./nodes/gemini.js";
export { XAI_NODES } from "./nodes/xai.js";
