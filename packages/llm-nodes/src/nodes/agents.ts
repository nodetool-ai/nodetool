import { createLogger } from "@nodetool-ai/config";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ImageRef, AudioRef } from "@nodetool-ai/node-sdk";
import type {
  Message,
  MessageContent,
  ProcessingContext,
  ProviderTool
} from "@nodetool-ai/runtime";
import type {
  Chunk,
  LanguageModel,
  OutputCorrelation,
  ProcessingMessage
} from "@nodetool-ai/protocol";
import { Agent } from "@nodetool-ai/agents";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

import type { ToolLike } from "./agent-utils.js";
import {
  asText,
  makeThreadId,
  getCategories,
  getModelConfig,
  generateStructured,
  parseCategory,
  normalizeMessage,
  buildUserMessage,
  toRefArray,
  uniqueToolName,
  normalizeTools,
  isChunkItem,
  isToolCallItem,
  classifyProviderStream,
  toProviderTools,
  serializeToolResult,
  toolCallChunk,
  streamProviderMessages,
  getStructuredOutputSchema,
  hasContentType
} from "./agent-utils.js";
import {
  seedFallbackThread,
  loadThreadMessages,
  saveThreadMessage
} from "./agent-threads.js";
import {
  RedactedThinkingStreamSplitter,
  extractThinkTags,
  yieldSplitThinkChunks
} from "./agent-thinking.js";
import { buildControlTools } from "./agent-control-tools.js";
import { ToolLikeAdapter } from "./agent-loop.js";
import {
  SUMMARIZER_RECOMMENDED_MODELS,
  ENHANCE_PROMPT_RECOMMENDED_MODELS,
  EXTRACTOR_RECOMMENDED_MODELS,
  CLASSIFIER_RECOMMENDED_MODELS,
  AGENT_RECOMMENDED_MODELS
} from "./agent-recommended-models.js";

// Re-exports so existing consumers of `@nodetool-ai/llm-nodes` (and the
// `@nodetool-ai/llm-nodes/agents` subpath) keep finding every symbol this
// module exported before the split into flat sibling modules.
//
// `expandAssetReferences`'s canonical home is `@nodetool-ai/runtime`'s
// `prompt-asset-refs` module, alongside the shared `findAssetRefs` parser.
export { expandAssetReferences } from "@nodetool-ai/runtime";
export type { ToolLike };
export {
  streamProviderMessages,
  isChunkItem,
  isToolCallItem,
  toProviderTools,
  serializeToolResult
};
export { runAgentLoop } from "./agent-loop.js";
export type { AgentLoopOptions, AgentLoopResult } from "./agent-loop.js";

const log = createLogger("nodetool.base-nodes.agents");

const DEFAULT_SYSTEM_PROMPT = "You are a friendly assistant";
const AGENT_DEFAULT_MAX_TOKENS = 16_384;
const EXTRACTOR_SYSTEM_PROMPT = [
  "You are a precise structured data extractor.",
  "Call the extraction tool exactly once with the extracted fields.",
  "Use only information present in the input; do not invent facts."
].join(" ");
const CLASSIFIER_SYSTEM_PROMPT = [
  "You are a precise classifier.",
  "Choose exactly one category from the allowed list.",
  'Return only JSON matching {"category":"<allowed-category>"} with no extra text.'
].join(" ");
const SUMMARIZER_SYSTEM_PROMPT =
  "You are an expert summarizer. Produce a concise, accurate summary.";
const ENHANCE_PROMPT_SYSTEM_PROMPT = [
  "You are an expert prompt engineer.",
  "Rewrite the user's draft into a single, clear, detailed prompt that gets better results.",
  "Preserve the original intent, add useful specificity, and remove ambiguity.",
  "Return only the improved prompt with no preamble, explanation, or surrounding quotation marks."
].join(" ");
// Per-target guidance appended to the user message so the rewrite is tuned to
// what the prompt will ultimately drive (an LLM, an image model, etc.).
const ENHANCE_PROMPT_GUIDANCE: Record<string, string> = {
  general:
    "Make it specific and unambiguous. State the goal, relevant context, the desired output format, and any constraints.",
  text: "Optimize for a text/LLM model: state the task, audience, tone, length, output structure, and any constraints.",
  image:
    "Optimize for an image generation model: describe the subject, setting, composition, lighting, color, art style, mood, and quality descriptors in vivid, concrete detail.",
  video:
    "Optimize for a video generation model: describe the subject and action, camera movement, shot framing, pacing, setting, lighting, and visual style.",
  audio:
    "Optimize for an audio/music generation model: describe the genre, mood, instruments, tempo, vocals, and production style.",
  code: "Optimize for a coding model: specify the language, the precise task, inputs and outputs, edge cases, and any libraries or constraints to use."
};
const ENHANCE_PROMPT_MAX_TOKENS = 1024;

export class SummarizerNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.Summarizer";
  static readonly body = "content_card";
  // Persist the primary text output as a generation so the node gets a
  // reload-surviving, browsable history like generative media nodes.
  static readonly autoSaveAsset = true;
  static readonly title = "Summarizer";
  static readonly description =
    "Generate concise summaries of text content using LLM providers with streaming output.\n    text, summarization, nlp, content, streaming\n\n    Specialized for creating high-quality summaries with real-time streaming:\n    - Condensing long documents into key points\n    - Creating executive summaries with live output\n    - Extracting main ideas from text as they're generated\n    - Maintaining factual accuracy while reducing length";
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk"
  };
  static readonly inlineFields = ["text"];
  static readonly inputFields = ["image", "audio", "system_prompt"];
  // Streamed output: each provider piece is emitted as a `chunk` iteration,
  // and the final aggregated summary is the `text` single output.
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    text: { kind: "single", source: "__execution__" },
    chunk: { kind: "iteration", source: "__execution__", group: "stream" }
  };
  static readonly recommendedModels = SUMMARIZER_RECOMMENDED_MODELS;

  @prop({
    type: "str",
    default:
      "\n        You are an expert summarizer. Your task is to create clear, accurate, and concise summaries using Markdown for structuring.\n        Follow these guidelines:\n        1. Identify and include only the most important information.\n        2. Maintain factual accuracy - do not add or modify information.\n        3. Use clear, direct language.\n        4. Keep the summary brief and to the point.\n        ",
    title: "System Prompt",
    description: "The system prompt for the summarizer"
  })
  declare system_prompt: string;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for summarization"
  })
  declare model: LanguageModel;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to summarize"
  })
  declare text: string;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image to condition the summary"
  })
  declare image: ImageRef;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio to condition the summary"
  })
  declare audio: AudioRef;

  @prop({
    type: "int",
    default: 3,
    title: "Max Sentences",
    description: "Approximate number of sentences for the summary.",
    min: 1,
    max: 100
  })
  declare max_sentences: number;

  private _maxSentences(): number {
    const raw = Number(this.max_sentences ?? 3);
    return Number.isFinite(raw) ? Math.max(1, raw) : 3;
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const text = asText(this.text ?? "");
    const maxSentences = this._maxSentences();
    const systemPrompt =
      asText(this.system_prompt ?? "").trim() || SUMMARIZER_SYSTEM_PROMPT;
    const { providerId, modelId } = getModelConfig(this.serialize());

    if (!providerId || !modelId) {
      throw new Error("Select a model");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context is required");
    }

    const provider = await context.getProvider(providerId);
    // Route streamed text through the think-tag splitter so a local model that
    // emits <think>…</think> never leaks reasoning into the summary. This node
    // has no `thinking` output, so the split-off thinking parts are dropped.
    const splitter = new RedactedThinkingStreamSplitter();
    const emitText = (piece: string): Record<string, unknown> | null =>
      piece
        ? {
            chunk: {
              type: "chunk",
              content: piece,
              content_type: "text",
              done: false
            },
            text: null
          }
        : null;
    let full = "";
    for await (const item of streamProviderMessages(provider, {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Summarize the following text in about ${maxSentences} sentence(s):\n\n${text}`
        }
      ],
      model: modelId,
      maxTokens: Math.max(64, maxSentences * 128)
    })) {
      if (isChunkItem(item) && !item.thinking) {
        const piece = typeof item.content === "string" ? item.content : "";
        if (piece) {
          full += piece;
          for (const part of splitter.feed(piece)) {
            if (part.kind === "text") {
              const out = emitText(part.content);
              if (out) yield out;
            }
          }
        }
      }
    }
    for (const part of splitter.flush()) {
      if (part.kind === "text") {
        const out = emitText(part.content);
        if (out) yield out;
      }
    }
    const summary = extractThinkTags(full).text.trim();
    yield { chunk: null, text: summary, output: summary };
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let text = "";
    for await (const item of this.genProcess(context)) {
      if (typeof item.text === "string") text = item.text;
    }
    return { text, output: text };
  }
}

export class EnhancePromptNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.EnhancePrompt";
  static readonly body = "content_card";
  // Persist the improved prompt as a generation so the node keeps a
  // reload-surviving, browsable history like the other content-card nodes.
  static readonly autoSaveAsset = true;
  static readonly title = "Enhance Prompt";
  static readonly description =
    "Rewrite a rough draft into a clearer, more detailed prompt using an LLM, with streaming output.\n    text, prompt, prompt-engineering, llm, rewrite, streaming\n\n    Turn a short or vague idea into an effective prompt:\n    - Add specificity, structure, and missing detail\n    - Tune the result for the target model (text, image, video, audio, code)\n    - Preserve the original intent while removing ambiguity\n    - Stream the improved prompt as it is written";
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk"
  };
  static readonly inlineFields = ["prompt"];
  static readonly inputFields = ["target", "system_prompt"];
  // Streamed output: each provider piece is emitted as a `chunk` iteration,
  // and the final improved prompt is the `text` single output.
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    text: { kind: "single", source: "__execution__" },
    chunk: { kind: "iteration", source: "__execution__", group: "stream" }
  };
  static readonly recommendedModels = ENHANCE_PROMPT_RECOMMENDED_MODELS;

  @prop({
    type: "str",
    default: ENHANCE_PROMPT_SYSTEM_PROMPT,
    title: "System Prompt",
    description: "The system prompt that guides how prompts are enhanced"
  })
  declare system_prompt: string;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for enhancing the prompt"
  })
  declare model: LanguageModel;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The draft prompt to enhance"
  })
  declare prompt: string;

  @prop({
    type: "enum",
    default: "general",
    title: "Target",
    description:
      "What the enhanced prompt is for. Tailors the rewrite to the target model: general purpose, a text/LLM model, or an image, video, audio, or code generation model.",
    values: ["general", "text", "image", "video", "audio", "code"]
  })
  declare target: string;

  private _target(): string {
    const raw = typeof this.target === "string" ? this.target.trim() : "";
    return raw in ENHANCE_PROMPT_GUIDANCE ? raw : "general";
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const prompt = asText(this.prompt ?? "").trim();
    const target = this._target();
    const systemPrompt =
      asText(this.system_prompt ?? "").trim() || ENHANCE_PROMPT_SYSTEM_PROMPT;
    const { providerId, modelId } = getModelConfig(this.serialize());

    if (!prompt) {
      yield { chunk: null, text: "", output: "" };
      return;
    }

    if (!providerId || !modelId) {
      throw new Error("Select a model");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context is required");
    }

    const provider = await context.getProvider(providerId);
    const guidance =
      ENHANCE_PROMPT_GUIDANCE[target] ?? ENHANCE_PROMPT_GUIDANCE.general;
    // Route streamed text through the think-tag splitter so a local model that
    // emits <think>…</think> never leaks reasoning into the improved prompt.
    // This node has no `thinking` output, so those parts are dropped.
    const splitter = new RedactedThinkingStreamSplitter();
    const emitText = (piece: string): Record<string, unknown> | null =>
      piece
        ? {
            chunk: {
              type: "chunk",
              content: piece,
              content_type: "text",
              done: false
            },
            text: null
          }
        : null;
    let full = "";
    for await (const item of streamProviderMessages(provider, {
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${guidance}\n\nImprove this prompt and return only the improved version:\n\n${prompt}`
        }
      ],
      model: modelId,
      maxTokens: ENHANCE_PROMPT_MAX_TOKENS
    })) {
      if (isChunkItem(item) && !item.thinking) {
        const piece = typeof item.content === "string" ? item.content : "";
        if (piece) {
          full += piece;
          for (const part of splitter.feed(piece)) {
            if (part.kind === "text") {
              const out = emitText(part.content);
              if (out) yield out;
            }
          }
        }
      }
    }
    for (const part of splitter.flush()) {
      if (part.kind === "text") {
        const out = emitText(part.content);
        if (out) yield out;
      }
    }
    const enhanced = extractThinkTags(full).text.trim() || prompt;
    yield { chunk: null, text: enhanced, output: enhanced };
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let text = "";
    for await (const item of this.genProcess(context)) {
      if (typeof item.text === "string") text = item.text;
    }
    return { text, output: text };
  }
}

export class CreateThreadNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.CreateThread";
  static readonly title = "Create Thread";
  static readonly inlineFields = ["title"];
  static readonly inputFields: string[] = [];
  static readonly description =
    "Create a new conversation thread and return its ID.\n    threads, chat, conversation, context\n\n    Use this to seed a thread_id that downstream Agent nodes can reuse for\n    persistent history across the graph or multiple runs.";
  static readonly metadataOutputTypes = {
    thread_id: "str"
  };

  @prop({
    type: "str",
    default: "Agent Conversation",
    title: "Title",
    description: "Optional title for the new thread"
  })
  declare title: string;

  @prop({
    type: "str",
    default: "",
    title: "Thread Id",
    description:
      "Optional custom thread ID. If provided and owned by the user, it will be reused; otherwise a new thread is created."
  })
  declare thread_id: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const requested = String(this.thread_id ?? "").trim();
    const title = String(this.title ?? "Agent Conversation");
    const id = requested || makeThreadId();

    // Threads are implicit in the message store: messages are keyed by
    // thread_id with no separate thread row, so when a real store is wired we
    // just mint/return the id and the first saved message creates the thread.
    // Only the in-memory fallback needs an explicit empty thread seeded so a
    // later loadThreadMessages finds it (and so a reused id survives eviction).
    if (!context?.hasModelInterface?.("createMessage")) {
      seedFallbackThread(id, title);
    }
    return { thread_id: id };
  }
}

export class ExtractorNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.Extractor";
  static readonly body = "content_card";
  static readonly title = "Extractor";
  static readonly description =
    "Extract structured data from text content using LLM providers.\n    data-extraction, structured-data, nlp, parsing\n\n    Specialized for extracting structured information:\n    - Converting unstructured text into structured data\n    - Identifying and extracting specific fields from documents\n    - Parsing text according to predefined schemas\n    - Creating structured records from natural language content";
  static readonly inlineFields = ["text"];
  static readonly inputFields = ["image", "audio", "system_prompt"];
  static readonly supportsDynamicOutputs = true;
  static readonly recommendedModels = EXTRACTOR_RECOMMENDED_MODELS;

  @prop({
    type: "str",
    default:
      '\nYou are a precise structured data extractor.\n\nGoal\n- Extract exactly the fields described by the extraction tool\'s schema from the content in <TEXT> (and any attached media).\n\nHow to respond (MANDATORY)\n- Call the extraction tool exactly once, passing the extracted fields as its arguments.\n- Do not answer in prose; the tool call is the only output.\n\nExtraction rules\n- Use only information found in <TEXT> or attached media. Do not invent facts.\n- Preserve source values; normalize internal whitespace and trim leading/trailing spaces.\n- If a required field is missing or not explicitly stated, return the closest reasonable default consistent with its type:\n  - string: ""\n  - number: 0\n  - boolean: false\n  - array/object: empty value of that type (only if allowed by the schema)\n- Dates/times: prefer ISO 8601 when the schema type is string and the value represents a date/time.\n- If multiple candidates exist, choose the most precise and unambiguous one.\n',
    title: "System Prompt",
    description: "The system prompt for the data extractor"
  })
  declare system_prompt: string;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for data extraction"
  })
  declare model: LanguageModel;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to extract data from"
  })
  declare text: string;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image to assist extraction"
  })
  declare image: ImageRef;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio to assist extraction"
  })
  declare audio: AudioRef;

  @prop({
    type: "int",
    default: 1024,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 100000
  })
  declare max_tokens: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = asText(this.text ?? "");
    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!providerId || !modelId) {
      throw new Error("Select a model");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context is required");
    }

    const provider = await context.getProvider(providerId);
    const schema = getStructuredOutputSchema(this) ?? {
      type: "object",
      properties: { output: { type: "string" } },
      required: ["output"],
      additionalProperties: true
    };
    const result = await generateStructured(provider, {
      model: modelId,
      maxTokens: Number(this.max_tokens ?? 1024),
      messages: [
        {
          role: "system",
          content:
            asText(this.system_prompt ?? "").trim() || EXTRACTOR_SYSTEM_PROMPT
        },
        { role: "user", content: text }
      ],
      toolName: "extraction_result",
      toolDescription: "Submit the extracted data.",
      schema
    });
    if (result) return result;
    throw new Error(
      "Extractor: the model did not return structured data for the extraction tool."
    );
  }
}

export class ClassifierNode extends BaseNode {
  static readonly nodeType = "nodetool.agents.Classifier";
  static readonly body = "content_card";
  // Persist the primary text output as a generation so the node gets a
  // reload-surviving, browsable history like generative media nodes.
  static readonly autoSaveAsset = true;
  static readonly title = "Classifier";
  static readonly description =
    "Classify text into predefined or dynamic categories using LLM.\n    classification, nlp, categorization\n\n    Use cases:\n    - Sentiment analysis\n    - Topic classification\n    - Intent detection\n    - Content categorization";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields = ["text"];
  static readonly inputFields = ["image", "audio", "system_prompt"];
  static readonly recommendedModels = CLASSIFIER_RECOMMENDED_MODELS;

  @prop({
    type: "str",
    default:
      '\nYou are a precise classifier.\n\nGoal\n- Select exactly one category from the list provided by the user.\n\nOutput format (MANDATORY)\n- Return ONLY a single JSON object with this exact schema and nothing else:\n  {"category": "<one-of-the-allowed-categories>"}\n- No prose, no Markdown, no code fences, no explanations, no extra keys.\n\nSelection criteria\n- Choose the single best category that captures the main intent of the text.\n- If multiple categories seem plausible, pick the most probable one; do not return multiple.\n- If none fit perfectly, choose the closest allowed category. If the list includes "Other" or "Unknown", prefer it when appropriate.\n- Be robust to casing, punctuation, emojis, and minor typos. Handle negation correctly (e.g., "not spam" ≠ spam).\n- Never invent categories that are not in the provided list.\n\nBehavior\n- Be deterministic for the same input.\n- Do not ask clarifying questions; make the best choice with what\'s given.\n',
    title: "System Prompt",
    description: "The system prompt for the classifier"
  })
  declare system_prompt: string;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for classification"
  })
  declare model: LanguageModel;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text to classify"
  })
  declare text: string;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "Optional image to classify in context"
  })
  declare image: ImageRef;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "Optional audio to classify in context"
  })
  declare audio: AudioRef;

  @prop({
    type: "list[str]",
    default: [],
    title: "Categories",
    description:
      "List of possible categories. If empty, LLM will determine categories."
  })
  declare categories: string[];

  @prop({
    type: "int",
    default: 256,
    title: "Max Tokens",
    description: "The maximum number of tokens to generate.",
    min: 1,
    max: 100000
  })
  declare max_tokens: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = asText(this.text ?? "");
    const categories = getCategories(this.categories);
    if (categories.length < 2) {
      throw new Error("At least 2 categories are required");
    }

    const { providerId, modelId } = getModelConfig(this.serialize());
    if (!providerId || !modelId) {
      throw new Error("Select a model");
    }
    if (!context || typeof context.getProvider !== "function") {
      throw new Error("Processing context is required");
    }

    const provider = await context.getProvider(providerId);
    const result = await generateStructured(provider, {
      model: modelId,
      maxTokens: Number(this.max_tokens ?? 256),
      messages: [
        {
          role: "system",
          content:
            asText(this.system_prompt ?? "").trim() || CLASSIFIER_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `Allowed categories: ${categories.join(", ")}\n\nText: ${text}`
        }
      ],
      toolName: "classification_result",
      toolDescription: "Submit the classification result.",
      schema: {
        type: "object",
        properties: {
          category: { type: "string", enum: categories }
        },
        required: ["category"]
      }
    });
    const category = parseCategory(
      result ? String(result.category ?? "") : "",
      categories
    );
    return { output: category, category };
  }
}

export class AgentNode extends BaseNode {
  static readonly nodeType: string = "nodetool.agents.Agent";
  static readonly body = "content_card";
  // Persist the primary text output as a generation so the node gets a
  // reload-surviving, browsable history like generative media nodes.
  static readonly autoSaveAsset = true;
  static readonly title: string = "Agent";
  static readonly description: string =
    "Chat with an LLM: send a prompt (plus optional images or audio), call tools, and stream back the response.\n    agent, llm, chat, text-generation, tools, streaming";
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk",
    thinking: "chunk",
    audio: "audio"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt", "image", "audio"];
  static readonly supportsDynamicOutputs = true;
  // Streamed outputs: each yielded chunk/thinking/audio is a distinct
  // iteration step. Without this, the analyzer defaults to `single`, which
  // gives every yield the same lineage key — downstream collapses to the
  // last value and early chunks are dropped.
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    text: { kind: "single", source: "__execution__" },
    chunk: { kind: "iteration", source: "__execution__", group: "stream" },
    thinking: { kind: "iteration", source: "__execution__", group: "stream" },
    audio: { kind: "iteration", source: "__execution__", group: "stream" }
  };
  static readonly recommendedModels = AGENT_RECOMMENDED_MODELS;

  @prop({
    type: "language_model",
    default: {
      type: "language_model",
      provider: "empty",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "Model to use for execution"
  })
  declare model: LanguageModel;

  @prop({
    type: "enum",
    default: "loop",
    title: "Mode",
    description:
      "How the agent runs.\n\n• loop: standard tool‑calling loop — the LLM responds to the prompt and may iteratively call the connected tools until it produces a final answer. Use this for chat, Q&A, and most tool‑using tasks. Only loop mode uses conversation history, threads, and image/audio inputs.\n• plan: the LLM first drafts a multi‑step task plan from the objective, then executes the steps in dependency order (independent steps run in parallel). Best for longer, structured jobs with clear sub‑tasks. Plan mode ignores/rejects the Thread ID, Messages (history), Images, and Audio inputs — it plans purely from the prompt objective.",
    values: ["loop", "plan"]
  })
  declare mode: string;

  @prop({
    type: "str",
    default: "You are a friendly assistant",
    title: "System",
    description:
      'Instructions that define the agent\'s persona, role, tone, and global behaviour. Sent to the model as the system message at the start of every run, before any history or user prompt. Use it for things that should always hold (e.g. "You are a senior Python reviewer. Reply in Markdown."). Leave the prompt itself for the per‑run task.'
  })
  declare system: string;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "The user message for this run — the actual question, task, or content the agent should act on. Appended after the system prompt and conversation history as the latest user turn. Any connected Image or Audio inputs are attached to this message (loop mode). In plan mode this is treated as the objective for planning."
  })
  declare prompt: string;

  @prop({
    type: "list[tool_name]",
    default: [],
    title: "Tools",
    description:
      "Tools to enable for the agent. Select workspace tools (read_file, write_file, list_directory) to enable file operations."
  })
  declare tools: string[];

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description:
      "Images to attach to the prompt. Loop mode only — plan mode rejects image inputs. Wire a list[image] source to send several at once, or a single Image (auto-wrapped into a one-item list). Each image becomes a separate block in the user message sent to the provider."
  })
  declare image: ImageRef[];

  @prop({
    type: "list[audio]",
    default: [],
    title: "Audio",
    description:
      "Audio clips to attach to the prompt. Loop mode only — plan mode rejects audio inputs. Wire a list[audio] source to send several at once, or a single Audio (auto-wrapped into a one-item list). Each clip becomes a separate block in the user message sent to the provider."
  })
  declare audio: AudioRef[];

  @prop({
    type: "list[message]",
    default: [],
    title: "Messages",
    description:
      "Prior conversation turns to include before the current prompt, in chronological order (oldest first). Loop mode only — plan mode rejects a non-empty history. Each item is a Message with a role (user/assistant/tool) and content. Use this to supply ad‑hoc context — for example, few‑shot examples, a previous chat transcript piped in from another node, or the messages output of an upstream Agent. Inserted between the system prompt and the new user prompt. If a Thread ID is also set, history loaded from the thread comes first, then this list, then the current prompt."
  })
  declare history: Message[];

  @prop({
    type: "str",
    default: "",
    title: "Thread ID",
    description:
      "Identifier for a persistent conversation thread. Loop mode only — plan mode rejects a thread_id. When set, the agent loads all earlier messages stored under this ID before this turn and saves the new user message, assistant reply, and any tool messages back to it — giving the agent long‑term memory across runs and across nodes that share the same ID. Leave empty for a stateless one‑shot call. Use the Create Thread node to mint a fresh ID, or wire in the same string from upstream to continue an existing conversation."
  })
  declare thread_id: string;

  @prop({
    type: "int",
    default: AGENT_DEFAULT_MAX_TOKENS,
    title: "Max Tokens",
    description:
      "Upper bound on generated tokens per response, including visible output and any reasoning/thinking tokens used by reasoning models. Applies in both loop and plan mode (plan mode threads it to every step executor and the final compiler pass). Higher values allow longer answers and more thinking headroom but cost more and take longer; very low values may truncate reasoning or the final answer. Typical values: 1024 for short answers, 8192–16384 for normal agent use, 32k+ for long-form or heavy reasoning. Must be within the chosen model's context window.",
    min: 1,
    max: 100000
  })
  declare max_tokens: number;

  @prop({
    type: "int",
    default: 100,
    title: "Max Turns",
    description:
      "Upper bound on agentic turns — one turn is a model call plus any tool execution it triggers. Caps both the AgentNode tool-loop iteration count and the provider's internal multi-turn budget (e.g. Claude Agent SDK). Raise for long sandbox sessions; lower to fail fast on runaway loops.",
    min: 1,
    max: 1000
  })
  declare max_turns: number;

  /**
   * Build the tool list for this run. Override in subclasses to inject
   * additional tools (e.g. sandbox shell/file/browser tools) alongside the
   * user-selected ones. Control tools from kernel control edges are
   * appended separately by the genProcess paths and don't need to be
   * handled here.
   */
  protected async buildTools(
    _context?: ProcessingContext
  ): Promise<ToolLike[]> {
    return normalizeTools(this.tools ?? []);
  }

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    const { providerId, modelId } = getModelConfig(this.serialize());
    log.info("AgentNode starting", {
      nodeId: this.__node_id ?? null,
      providerId,
      modelId,
      hasContext: Boolean(context),
      hasGetProvider: Boolean(
        context && typeof context.getProvider === "function"
      ),
      propKeys: Object.keys(this.serialize())
    });
    if (!providerId || !modelId) {
      log.error("AgentNode missing model selection", {
        nodeId: this.__node_id ?? null,
        providerId,
        modelId,
        modelInput: this.model ?? null,
        modelProp: this.model ?? null
      });
      throw new Error("Select a model");
    }
    if (!context || typeof context.getProvider !== "function") {
      log.error("AgentNode missing processing context or provider access", {
        nodeId: this.__node_id ?? null,
        providerId,
        modelId
      });
      throw new Error("Processing context is required");
    }

    // --- Dispatch to Agent (TaskPlanner → ParallelTaskExecutor → CompilerAgent) for "plan" mode ---
    const agentMode = String(this.mode ?? "loop").trim();
    if (agentMode === "plan") {
      yield* this.genProcessPlanMode(context, providerId, modelId);
      return;
    }

    const prompt = asText(this.prompt ?? "");
    let system = asText(this.system ?? DEFAULT_SYSTEM_PROMPT);
    const images = this.image;
    const audios = this.audio;
    const historyInput = this.history;
    const history = Array.isArray(historyInput)
      ? historyInput
          .map((item) => normalizeMessage(item))
          .filter((item): item is Message => item !== null)
      : [];
    const threadId = String(this.thread_id ?? "").trim();
    const maxTokens = Number(this.max_tokens ?? AGENT_DEFAULT_MAX_TOKENS);
    const maxTurns = Math.max(1, Number(this.max_turns ?? 100));
    const tools: ToolLike[] = await this.buildTools(context);

    // Build control tools from _control_context (injected by the kernel
    // for nodes that have outgoing control edges). This lets the LLM
    // call controlled nodes as tools.
    const controlContext =
      this.getDynamic<Record<string, unknown>>("_control_context");
    const controlTools = buildControlTools(controlContext);
    if (controlTools.length > 0) {
      tools.push(...controlTools);
      log.info("AgentNode added control tools", {
        nodeId: this.__node_id ?? null,
        controlToolNames: controlTools.map((t) => t.name),
        controlTargets: controlTools.map((t) => t.targetNodeId)
      });
    }

    const structuredSchema = getStructuredOutputSchema(this);
    let structuredResult: Record<string, unknown> | null = null;
    const structuredToolName = structuredSchema
      ? uniqueToolName(
          "submit_result",
          tools.map((tool) => tool.name)
        )
      : null;
    if (structuredSchema && structuredToolName) {
      tools.push({
        name: structuredToolName,
        description:
          "Submit the final structured result for this agent node's dynamic outputs. Call this exactly once when you have the final answer.",
        inputSchema: structuredSchema,
        process: async (_context, params) => {
          structuredResult = params ?? {};
          return { status: "completed" };
        }
      });
      system = `${system}\n\nWhen the final answer is ready, call the ${structuredToolName} tool with values for the dynamic outputs. Do not format the final result as JSON text.`;
    }

    const messages: Message[] = [
      { role: "system", content: system },
      ...(await loadThreadMessages(context, threadId)),
      ...history,
      buildUserMessage(prompt, images, audios)
    ];
    log.info("AgentNode prepared messages", {
      nodeId: this.__node_id ?? null,
      providerId,
      modelId,
      threadId: threadId || null,
      promptLength: prompt.length,
      historyCount: history.length,
      toolCount: tools.length,
      messageCount: messages.length,
      hasImage: hasContentType(messages[messages.length - 1], "image_url"),
      hasAudio: hasContentType(messages[messages.length - 1], "audio")
    });

    if (threadId) {
      await saveThreadMessage(context, threadId, messages[messages.length - 1]);
    }

    // Dereference inline asset:// references (mentioned in the prompt) to data
    // URIs before the provider call. Resolution lives in the runtime layer so
    // it's shared across nodes and providers stay asset-agnostic. Saved to the
    // thread above first, so the stored message keeps the compact asset:// URI.
    if (typeof context.resolveMessageMediaUris === "function") {
      const resolved = await context.resolveMessageMediaUris(messages);
      messages.splice(0, messages.length, ...resolved);
    }

    // Held in an object so the nested finalizeAssistantTurn closure can update
    // it without tripping control-flow narrowing at the read sites below.
    const finalText: { value: string | null } = { value: null };

    // Each provider tool carries its own `execute` (generateLoop dispatches to
    // it directly) instead of a harness-level executeTool callback. Control
    // tools route through sendControlEvent; regular tools call tool.process;
    // submit_result (the structured tool) is marked `terminal` so generateLoop
    // ends the loop after it runs — its process populates structuredResult.
    const providerTools: ProviderTool[] | undefined =
      tools.length > 0
        ? toProviderTools(tools).map((pt, i) => {
            const tool = tools[i];
            const isStructured =
              structuredToolName != null && tool.name === structuredToolName;
            return {
              ...pt,
              terminal: isStructured,
              execute: async (
                args: Record<string, unknown>
              ): Promise<string | MessageContent[]> => {
                if (typeof tool.process !== "function") {
                  log.warn(
                    "AgentNode tool call had no matching executable tool",
                    {
                      nodeId: this.__node_id ?? null,
                      toolName: tool.name,
                      availableTools: tools.map((candidate) => candidate.name)
                    }
                  );
                  return JSON.stringify({
                    status: "error",
                    error: `Unknown or non-executable tool: ${tool.name}`
                  });
                }

                // Control tools carry their own dispatch logic in `process`
                // (filter args → sendControlEvent), so they flow through this
                // generic path like any other tool.
                let result: unknown;
                log.info("AgentNode executing tool", {
                  nodeId: this.__node_id ?? null,
                  toolName: tool.name
                });
                try {
                  result = await tool.process(context, args);
                } catch (err) {
                  const message =
                    err instanceof Error ? err.message : String(err);
                  log.warn("AgentNode tool execution failed", {
                    nodeId: this.__node_id ?? null,
                    toolName: tool.name,
                    error: message
                  });
                  result = { status: "error", error: message };
                }

                return JSON.stringify(serializeToolResult(result));
              }
            };
          })
        : undefined;
    const provider = await context.getProvider(providerId);

    {
      // The provider drives the tool-calling loop via generateLoop. This is the
      // headline fix: on the Claude Agent SDK provider, generateLoop registers
      // `providerTools` (including submit_result) with the SDK agent and calls
      // back into `executeTool` per call — the tool-free generateMessages
      // primitive never saw them. Other providers run the standard completion
      // loop and call back the same way. generateLoop owns the message array and
      // streams: text/thinking/audio chunks, ToolCall announcements (before
      // execution), and `{ type: "message" }` events for each finalized
      // assistant turn and tool result (which we mirror to thread persistence).
      // Tool execution and loop termination are driven by the provider tools'
      // own `execute`/`terminal` (built above), not a harness callback.
      let assistantText = "";
      let streamedRedactedThinking = false;
      let thinkSplitter = new RedactedThinkingStreamSplitter();

      // Finalize one assistant turn: flush any buffered think-split remainder,
      // then emit the cleaned final text (and any non-streamed thinking) and
      // update lastTextOutput. Resets the per-turn accumulators so the next turn
      // starts clean. Driven off the assistant `message` events generateLoop
      // emits — one per assistant turn — plus a final call after the stream for
      // providers that finish without a trailing assistant message event.
      const finalizeAssistantTurn = function* (): Generator<
        Record<string, unknown>
      > {
        for (const part of thinkSplitter.flush()) {
          if (part.kind === "thinking" && part.content.length > 0) {
            streamedRedactedThinking = true;
            yield {
              chunk: null,
              thinking: {
                type: "chunk",
                content: part.content,
                thinking: true
              },
              text: null,
              audio: null
            };
          } else if (part.kind === "text" && part.content.length > 0) {
            yield {
              chunk: {
                type: "chunk",
                content: part.content,
                content_type: "text",
                done: false
              },
              thinking: null,
              text: null,
              audio: null
            };
          }
        }

        if (assistantText) {
          const { thinking: thinkingText, text: cleanText } =
            extractThinkTags(assistantText);
          const trimmed = cleanText.trim();
          if (trimmed) {
            finalText.value = trimmed;
          }
          if (thinkingText && !streamedRedactedThinking) {
            yield {
              chunk: null,
              thinking: {
                type: "chunk",
                content: thinkingText,
                thinking: true
              },
              text: null,
              audio: null
            };
          }
          yield {
            chunk: null,
            thinking: null,
            text: cleanText,
            audio: null
          };
        }

        assistantText = "";
        streamedRedactedThinking = false;
        thinkSplitter = new RedactedThinkingStreamSplitter();
      };

      const stream = provider.generateLoop({
        messages,
        model: modelId,
        tools: providerTools,
        maxTokens,
        maxIterations: maxTurns,
        sequentialTools: true,
        threadId: threadId || undefined
      });
      for await (const event of classifyProviderStream(stream)) {
        if (event.kind === "tool_call") {
          const toolCall = event.toolCall;
          log.info("AgentNode received tool call", {
            nodeId: this.__node_id ?? null,
            providerId,
            modelId,
            toolCallId: toolCall.id,
            toolName: toolCall.name,
            argKeys: Object.keys(toolCall.args ?? {})
          });
          yield {
            chunk: toolCallChunk(toolCall),
            thinking: null,
            text: null,
            audio: null
          };
          continue;
        }

        if (event.kind === "thinking") {
          yield { chunk: null, thinking: event.chunk, text: null, audio: null };
          continue;
        }

        if (event.kind === "audio") {
          const chunk = event.chunk;
          yield { chunk, thinking: null, text: null, audio: null };
          const audioBytes =
            typeof chunk.content === "string" && chunk.content
              ? Buffer.from(chunk.content, "base64")
              : chunk.content instanceof Float32Array
                ? Buffer.from(
                    chunk.content.buffer,
                    chunk.content.byteOffset,
                    chunk.content.byteLength
                  )
                : Buffer.alloc(0);
          yield {
            chunk: null,
            thinking: null,
            text: null,
            audio: { data: new Uint8Array(audioBytes) }
          };
          continue;
        }

        if (event.kind === "text") {
          const rawPiece = event.delta;
          assistantText += rawPiece;
          for (const y of yieldSplitThinkChunks(
            event.chunk,
            rawPiece,
            thinkSplitter
          )) {
            if (y.thinking != null) streamedRedactedThinking = true;
            yield y;
          }
          continue;
        }

        // A finalized message event (assistant turn or tool result). generateLoop
        // owns the message array; we mirror the old per-turn finalization +
        // thread persistence off these. Each assistant event closes a turn.
        if (event.kind === "assistant_message") {
          const message = event.message;
          // Rebuild the persisted assistant message from our own accumulated
          // text (which excludes audio chunks) so saved history keeps its old
          // array shape; carry tool calls / Gemini thought-signature parts from
          // the event since generateLoop now owns the live message.
          const hadToolCalls = (message.toolCalls?.length ?? 0) > 0;
          const persistMessage: Message = {
            role: "assistant",
            content: [{ type: "text", text: assistantText }],
            toolCalls: message.toolCalls ?? null
          };
          if (message._rawGeminiParts) {
            persistMessage._rawGeminiParts = message._rawGeminiParts;
          }
          const shouldPersist = Boolean(assistantText) || hadToolCalls;
          yield* finalizeAssistantTurn();
          if (threadId && shouldPersist) {
            await saveThreadMessage(context, threadId, persistMessage);
          }
        } else if (event.kind === "tool_message") {
          if (threadId) {
            await saveThreadMessage(context, threadId, event.message);
          }
        }
      }

      // Flush any trailing turn for providers that stream final text without a
      // closing assistant message event (no-op once a turn has been finalized).
      yield* finalizeAssistantTurn();
    }

    if (structuredSchema && structuredResult) {
      log.info("AgentNode yielding dynamic output tool result", {
        nodeId: this.__node_id ?? null,
        keys: Object.keys(structuredResult)
      });
      yield structuredResult;
    }

    log.info("AgentNode completed", {
      nodeId: this.__node_id ?? null,
      providerId,
      modelId,
      finalTextLength: finalText.value?.length ?? 0,
      returnedStructured: Boolean(structuredResult)
    });
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    let lastText = "";
    let lastAudio: Record<string, unknown> | null = null;
    let structuredResult: Record<string, unknown> | null = null;

    for await (const item of this.genProcess(context)) {
      if (
        "chunk" in item ||
        "thinking" in item ||
        "text" in item ||
        "audio" in item
      ) {
        if (typeof item.text === "string") {
          lastText = item.text;
        }
        if (item.audio && typeof item.audio === "object") {
          lastAudio = item.audio as Record<string, unknown>;
        }
      } else {
        structuredResult = item;
      }
    }

    if (structuredResult) {
      log.info("AgentNode process() returning structured result", {
        nodeId: this.__node_id ?? null,
        keys: Object.keys(structuredResult)
      });
      return structuredResult;
    }

    log.info("AgentNode process() returning aggregate result", {
      nodeId: this.__node_id ?? null,
      textLength: lastText.length,
      hasAudio: Boolean(lastAudio)
    });
    return {
      text: lastText,
      output: lastText,
      chunk: null,
      thinking: null,
      audio: lastAudio
    };
  }

  /**
   * Dispatch to Agent for "plan" mode.
   * Converts ToolLike[] to AgentTool[] and bridges ProcessingMessage to node outputs.
   */
  private async *genProcessPlanMode(
    context: ProcessingContext,
    providerId: string,
    modelId: string
  ): AsyncGenerator<Record<string, unknown>> {
    // Plan mode runs a fresh planning agent off the objective — it has no
    // conversation transcript, thread persistence, or media attachment path.
    // Reject those inputs loudly instead of silently dropping them (the old
    // behavior); they only apply in loop mode.
    const threadId = String(this.thread_id ?? "").trim();
    const history = Array.isArray(this.history) ? this.history : [];
    const images = toRefArray(this.image);
    const audios = toRefArray(this.audio);
    if (
      threadId ||
      history.length > 0 ||
      images.length > 0 ||
      audios.length > 0
    ) {
      throw new Error(
        "thread_id, history, image, and audio inputs only apply in loop mode. " +
          'Set Mode to "loop" to use conversation history, threads, or image/audio inputs.'
      );
    }

    const prompt = asText(this.prompt ?? "");
    const system = asText(this.system ?? DEFAULT_SYSTEM_PROMPT);
    const rawTools: ToolLike[] = await this.buildTools(context);
    const structuredSchema = getStructuredOutputSchema(this);

    // Build control tools
    const controlContext =
      this.getDynamic<Record<string, unknown>>("_control_context");
    const controlTools = buildControlTools(controlContext);
    if (controlTools.length > 0) {
      rawTools.push(...controlTools);
    }

    // Convert ToolLike[] to AgentTool[] for Agent
    const agentTools = rawTools.map((t) => new ToolLikeAdapter(t));

    const provider = await context.getProvider(providerId);

    const agent = new Agent({
      name: `AgentNode_${this.__node_id ?? "default"}`,
      objective: prompt,
      provider,
      model: modelId,
      tools: agentTools,
      systemPrompt: system,
      outputSchema: structuredSchema ?? undefined,
      planningModel: modelId,
      // Per-turn output-token cap, matching loop mode's use of max_tokens.
      // Threaded to every step executor and the final compiler pass.
      maxTokens: Number(this.max_tokens ?? AGENT_DEFAULT_MAX_TOKENS),
      // maxSteps caps the *number of plan steps* the executor will run
      // (`stepsTaken < maxSteps` in TaskExecutor), not the per-step tool-call
      // iteration count. The node's `max_turns` is a turn/iteration budget, so
      // it maps to maxStepIterations semantics, not maxSteps — deriving maxSteps
      // from max_turns would conflate plan size with turn count. Kept fixed here.
      maxSteps: 10,
      maxStepIterations: 5
    });

    let lastText = "";

    const statusChunk = (
      kind: string,
      content: string,
      metadata: Record<string, unknown> = {}
    ): Chunk =>
      ({
        type: "chunk",
        content_type: "agent_status",
        content,
        content_metadata: { kind, ...metadata },
        done: false
      }) as Chunk;

    for await (const msg of agent.execute(context)) {
      const pmsg = msg as ProcessingMessage;
      if (pmsg.type === "chunk") {
        const chunk = pmsg as Chunk;
        const content = chunk.content ?? "";
        lastText += content;
        yield {
          chunk: { type: "chunk", content, done: false },
          thinking: null,
          text: null,
          audio: null
        };
      } else if (pmsg.type === "step_result") {
        const result = (pmsg as any).result;
        if (result != null) {
          const resultText =
            typeof result === "string" ? result : JSON.stringify(result);
          lastText = resultText;
        }
      } else if (pmsg.type === "log_update") {
        const p = pmsg as any;
        log.info("Agent log", {
          nodeId: this.__node_id ?? null,
          content: p.content
        });
        yield {
          chunk: statusChunk("log", String(p.content ?? ""), {
            severity: p.severity ?? "info"
          }),
          thinking: null,
          text: null,
          audio: null
        };
      } else if (pmsg.type === "planning_update") {
        const p = pmsg as any;
        const content = p.content ?? `${p.phase}: ${p.status}`;
        yield {
          chunk: statusChunk("planning", String(content), {
            phase: p.phase,
            status: p.status
          }),
          thinking: null,
          text: null,
          audio: null
        };
      } else if (pmsg.type === "task_update") {
        const p = pmsg as any;
        const taskTitle = p.task?.title ?? p.task?.id ?? "task";
        const stepTitle = p.step?.instructions ?? p.step?.id ?? "";
        const content = stepTitle
          ? `${p.event}: ${taskTitle} — ${stepTitle}`
          : `${p.event}: ${taskTitle}`;
        yield {
          chunk: statusChunk("task", content, {
            event: p.event,
            task_id: p.task?.id,
            step_id: p.step?.id
          }),
          thinking: null,
          text: null,
          audio: null
        };
      } else if (pmsg.type === "tool_call_update") {
        const p = pmsg as any;
        const argsPreview = (() => {
          try {
            return JSON.stringify(p.args ?? {});
          } catch {
            return "";
          }
        })();
        yield {
          chunk: statusChunk(
            "tool_call",
            `${p.name}(${argsPreview.slice(0, 200)})`,
            { name: p.name, args: p.args, message: p.message }
          ),
          thinking: null,
          text: null,
          audio: null
        };
      }
    }

    const finalResults = agent.getResults();
    const resultText =
      lastText ||
      (finalResults != null
        ? typeof finalResults === "string"
          ? finalResults
          : JSON.stringify(finalResults)
        : "");

    yield { chunk: null, thinking: null, text: resultText, audio: null };

    // When the node declares dynamic outputs, surface the agent's structured
    // result as a bare object so process()/the kernel route it to those output
    // handles — mirroring loop mode's `yield structuredResult`. Without this,
    // plan mode only ever emits `text` and dynamic outputs stay empty.
    if (
      structuredSchema &&
      finalResults &&
      typeof finalResults === "object" &&
      !Array.isArray(finalResults)
    ) {
      yield finalResults as Record<string, unknown>;
    }
  }
}

/**
 * Virtual LLM step that inherits the workflow's configured model.
 *
 * Designed for graph-mode agent workflows: GraphPlanner adds these nodes,
 * AgentWorkflowRunner intercepts them by `nodeType` and routes execution
 * through `AgentStepExecutor` (which has access to the workflow's configured
 * provider+model). The class registers metadata so the registry,
 * search_nodes, and get_node_info expose it like any other node — but its
 * `process()` will refuse to run via the standard kernel path because the
 * configured provider/model is supplied by the agent runner, not by a
 * `model` property on the node.
 */
export class AgentStepNode extends BaseNode {
  static readonly nodeType: string = "nodetool.agents.AgentStep";
  static readonly title: string = "Agent Step";
  static readonly description: string =
    "LLM step that inherits the workflow's configured model.\n    agents, llm, step, reasoning\n\n    Use this node inside agent-mode workflows when you need an LLM to\n    reason, transform text, or call tools. The step receives upstream\n    edges as context, runs the workflow's configured LLM, and emits the\n    final text on its `output` handle.\n\n    Properties:\n    - instructions (required): the prompt for this step\n    - tools (optional): list of tool names this step may call\n    - output_schema (optional): JSON schema (as a string) constraining the output\n\n    Unlike Agent / Summarizer, this node does NOT take a model property —\n    the workflow's configured model is used.";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  // Hidden from the node palette/search: GraphPlanner and AgentWorkflowRunner
  // insert this node; adding it by hand throws in process(). It stays
  // registered so the registry, search_nodes, and get_node_info still resolve
  // it for those agent runners.
  static readonly hidden = true;
  static readonly inlineFields = ["instructions"];
  static readonly inputFields = ["input"];

  @prop({
    type: "str",
    default: "",
    title: "Instructions",
    description: "Instructions for the LLM step (acts as the user prompt).",
    required: true
  })
  declare instructions: string;

  @prop({
    type: "list[str]",
    default: [],
    title: "Tools",
    description:
      "Optional list of tool names the step is allowed to call. Empty = no tools."
  })
  declare tools: string[];

  @prop({
    type: "str",
    default: "",
    title: "Output Schema",
    description:
      "Optional JSON schema (as a string) constraining the step output. Empty = freeform text."
  })
  declare output_schema: string;

  @prop({
    type: "any",
    default: null,
    title: "Input",
    description:
      "Upstream data forwarded to the step as context. Connect any node here."
  })
  declare input: unknown;

  async process(): Promise<Record<string, unknown>> {
    throw new Error(
      "AgentStep is not a standalone node — do not add it to a graph by hand. " +
        "It is inserted by GraphPlanner and executed by AgentWorkflowRunner, " +
        "which supplies the workflow's configured provider/model; it has no " +
        "`model` property of its own, so the standard workflow runner cannot " +
        "run it. For a standalone LLM step you place yourself, use " +
        "`nodetool.agents.Agent` (it has its own model property) instead."
    );
  }
}

export const AGENT_NODES = tagAsServer([
  SummarizerNode,
  EnhancePromptNode,
  CreateThreadNode,
  ExtractorNode,
  ClassifierNode,
  AgentNode,
  AgentStepNode
]);
