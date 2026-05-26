/**
 * @nodetool-ai/llm-nodes — LLM provider + agent node bundle.
 *
 * Classes from `openai.ts` and `gemini.ts` share names (`EmbeddingNode`,
 * etc.) so we re-export the `_NODES` registration arrays under the
 * provider-prefixed names, plus the agent-tool plumbing that
 * sibling packages (`code-nodes/sandbox`, `code-nodes/tool-agents`)
 * need to import.
 */

export { AGENT_NODES, runAgentLoop, type ToolLike } from "./nodes/agents.js";

export {
  registerBuiltinAgentToolClasses,
  resolveBuiltinAgentTool,
  hydrateBuiltinAgentTool,
  hydrateBuiltinAgentTools
} from "./nodes/agent-tool-hydration.js";

export { GEMINI_NODES } from "./nodes/gemini.js";
export { OPENAI_NODES } from "./nodes/openai.js";
export { MISTRAL_NODES } from "./nodes/mistral.js";
export { GENERATOR_NODES } from "./nodes/generators.js";
export { TEAM_NODES } from "./nodes/team.js";
