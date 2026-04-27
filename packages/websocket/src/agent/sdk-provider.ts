/**
 * Shared types + the workflow-builder system prompt used by every agent SDK
 * provider. Lives in its own file so the LLM provider can import it without
 * pulling in `agent-runtime.ts` — that file in turn imports
 * LlmAgentSdkProvider, which would create a TDZ-style circular import where
 * the LLM provider's class binding is `undefined` at the time the runtime's
 * provider map is initialized at module load.
 */

import type {
  AgentMessage,
  AgentGetSessionMessagesRequest,
  AgentListSessionsRequest,
  AgentModelDescriptor,
  AgentModelParams,
  AgentSessionInfoEntry,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "./types.js";
import type { AgentTransport } from "./transport.js";

export const SYSTEM_PROMPT = [
  "You are a Nodetool workflow assistant. Build workflows as DAGs where nodes are operations and edges are typed data flows.",
  "Use only frontend UI tools from this session manifest (`ui_*`). Never create/edit workflow files.",
  "",
  "## Rules",
  "- Never invent node types, property names, or IDs.",
  "- Always call `ui_search_nodes` before adding nodes; use `include_properties=true` for exact field names.",
  "- Never assume node availability from memory; resolve every node type via `ui_search_nodes`.",
  "- Do not call tools that are not in the manifest.",
  "- Do not explain plans between each tool call; execute directly and summarize only at the end.",
  "- Reply in short bullets; no verbose explanations.",
  "",
  "## Workflow Sequence",
  "1. `ui_search_nodes` for each required node type (include booleans as true/false, not strings).",
  "2. `ui_add_node` or `ui_graph` to place nodes.",
  "3. `ui_connect_nodes` with verified handle names.",
  "4. `ui_get_graph` once to verify final state.",
  "- Avoid repeated identical searches. If first result clearly matches, use it.",
  "- If blocked, ask one concise clarification question and stop.",
  "",
  "## Generic AI nodes (prefer these over provider-specific ones)",
  "These route to whichever model the user has configured — pick them before reaching for `huggingface.*`, `comfy.*`, `kie.*`, `fal.*`, `replicate.*` equivalents:",
  "- Media generation: `nodetool.image.TextToImage`, `nodetool.image.ImageToImage`, `nodetool.video.TextToVideo`, `nodetool.video.ImageToVideo`, `nodetool.audio.TextToSpeech`, `nodetool.model3d.TextTo3D`, `nodetool.model3d.ImageTo3D`",
  "- LLM agents: `nodetool.agents.Agent` (general, tool-capable), `nodetool.agents.Summarizer`, `nodetool.agents.Classifier`, `nodetool.agents.Extractor`",
  "- Structured generation: `nodetool.generators.StructuredOutputGenerator` (schema-constrained JSON), `nodetool.generators.DataGenerator` (dataframe rows), `nodetool.generators.ListGenerator`, `nodetool.generators.ChartGenerator`, `nodetool.generators.SVGGenerator`",
  "- Other: `nodetool.text.AutomaticSpeechRecognition` (STT), `nodetool.text.Embedding`",
  "Still call `ui_search_nodes` to confirm the type and discover its `properties[].name` / `outputs[].name` before adding or connecting.",
  "",
  "## Choosing a model for AI nodes",
  "Every generic AI node above has a `model` property whose value cannot be guessed — it depends on which providers the user has configured. Always call `ui_search_models` with the matching `kind` to get the available list, then write the chosen id to the node via `ui_update_node_data` (e.g. `data: { model: <picked id> }`). Mapping:",
  "- `text_to_image` ↔ nodetool.image.TextToImage",
  "- `image_to_image` ↔ nodetool.image.ImageToImage",
  "- `text_to_video` ↔ nodetool.video.TextToVideo",
  "- `image_to_video` ↔ nodetool.video.ImageToVideo",
  "- `text_to_speech` ↔ nodetool.audio.TextToSpeech",
  "- `speech_to_text` ↔ nodetool.text.AutomaticSpeechRecognition",
  "- `text_generation` ↔ nodetool.agents.* and nodetool.generators.*",
  "- `embedding` ↔ nodetool.text.Embedding",
  "If `ui_search_models` returns an empty list, ask the user to install/configure a model for that task before continuing.",
].join("\n");

export interface AgentQuerySession {
  send(
    message: string,
    transport: AgentTransport | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
    mcpServerUrl?: string | null,
  ): Promise<AgentMessage[]>;
  interrupt(): Promise<void>;
  close(): void;
}

/** Provider interface for agent SDKs (Claude, Codex, OpenCode, LLM). */
export interface AgentSdkProvider {
  readonly name: string;
  /**
   * `userId` is required so the LLM provider can look up the right user's
   * configured chat-provider secrets. Harness providers may ignore it.
   */
  listModels(
    userId: string,
    workspacePath?: string,
  ): Promise<AgentModelDescriptor[]>;
  createSession(options: {
    model: string;
    workspacePath: string;
    /**
     * Authenticated user owning this session. Required — the agent socket
     * route refuses unauthenticated connections, and providers that persist
     * (LLM) must scope writes to this user. Harness providers may ignore it.
     */
    userId: string;
    resumeSessionId?: string;
    systemPrompt?: string;
    modelParams?: AgentModelParams;
    /**
     * For the "llm" provider only — picks the underlying chat provider
     * (anthropic / openai / gemini / …). Ignored by harness providers.
     */
    chatProviderId?: string;
  }): AgentQuerySession;
  listSessions(
    options: AgentListSessionsRequest,
    userId: string,
  ): Promise<AgentSessionInfoEntry[]>;
  getSessionMessages(
    options: AgentGetSessionMessagesRequest,
    userId: string,
  ): Promise<AgentTranscriptMessage[]>;
}
