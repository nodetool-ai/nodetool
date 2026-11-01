import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { WebSearchOutputs } from "./native-web-search.js";
import {
  modelIdOf,
  providerModelProp,
  type ModelFieldValue
} from "./provider-model-prop.js";

/**
 * Nodes that run on a ChatGPT sign-in through the Codex backend instead of an
 * OpenAI API key. That backend serves only the Responses API: chat, its
 * built-in `web_search` and `image_generation` tools. Embeddings, moderation,
 * speech, transcription and realtime need the API key, so they stay in the
 * `openai` namespace.
 */

type CodexWebSearchProvider = {
  webSearch(args: {
    query: string;
    model?: string;
    signal?: AbortSignal;
  }): Promise<WebSearchOutputs>;
};

function hasWebSearch(value: unknown): value is CodexWebSearchProvider {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { webSearch?: unknown }).webSearch === "function"
  );
}

export class CodexWebSearchNode extends BaseNode {
  static readonly nodeType = "codex.text.WebSearch";
  static readonly body = "content_card";
  static readonly primaryOutput = "text";
  static readonly title = "Web Search";
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["query"];
  static readonly description =
    "Answer a query from current web pages with OpenAI's web search, on your ChatGPT sign-in instead of an API key.\n    codex, chatgpt, openai, web, search, internet, current, sources";
  static readonly metadataOutputTypes = { text: "str", sources: "list" };

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "The question to research on the web."
  })
  declare query: string;

  @providerModelProp(
    "language_model",
    PROVIDER_IDS.CODEX,
    "",
    "The Codex model that searches. Leave empty for the first model your ChatGPT plan offers."
  )
  declare model: ModelFieldValue;

  async process(context?: ProcessingContext): Promise<WebSearchOutputs> {
    if (!context) throw new Error("Web search needs a processing context");
    const provider = await context.getProvider(PROVIDER_IDS.CODEX);
    if (!hasWebSearch(provider)) {
      throw new Error("The Codex provider has no web search");
    }
    return provider.webSearch({
      query: this.query,
      model: modelIdOf(this.model) || undefined,
      signal: context.signal
    });
  }
}

/** Output handles CodexCreateImageNode.process() emits. */
type CodexCreateImageOutputs = {
  output: { type: string; data: string };
};

/** `WIDTHxHEIGHT` for each size choice. `auto` lets the model pick. */
const SIZES: Record<string, [number, number] | undefined> = {
  auto: undefined,
  "1024x1024": [1024, 1024],
  "1536x1024": [1536, 1024],
  "1024x1536": [1024, 1536]
};

export class CodexCreateImageNode extends BaseNode {
  static readonly nodeType = "codex.image.CreateImage";
  static readonly body = "content_card";
  static readonly title = "Create Image";
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly description =
    "Generate an image with GPT Image on your ChatGPT sign-in instead of an API key.\n    codex, chatgpt, openai, image, generation, gpt-image, text-to-image";
  static readonly metadataOutputTypes = { output: "image" };
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "What the image should show."
  })
  declare prompt: string;

  @providerModelProp("image_model", PROVIDER_IDS.CODEX, "gpt-image-2", "The image model.")
  declare model: ModelFieldValue;

  @prop({
    type: "enum",
    default: "auto",
    title: "Size",
    description: "The image size in pixels, or auto.",
    values: Object.keys(SIZES)
  })
  declare size: string;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quality",
    description: "Rendering quality. Higher quality takes longer and uses more of your plan.",
    values: ["auto", "low", "medium", "high"]
  })
  declare quality: string;

  async process(context?: ProcessingContext): Promise<CodexCreateImageOutputs> {
    if (!context) throw new Error("Image generation needs a processing context");
    if (!this.prompt) throw new Error("The input prompt cannot be empty.");
    const model = modelIdOf(this.model);
    if (!model) throw new Error("Select a model");
    const size = SIZES[this.size];
    const bytes = (await context.runProviderPrediction({
      provider: PROVIDER_IDS.CODEX,
      capability: "text_to_image",
      model,
      params: {
        prompt: this.prompt,
        width: size?.[0],
        height: size?.[1],
        quality: this.quality === "auto" ? undefined : this.quality
      }
    })) as Uint8Array;
    return {
      output: { type: "image", data: Buffer.from(bytes).toString("base64") }
    };
  }
}

export const CODEX_NODES = tagAsServer([CodexWebSearchNode, CodexCreateImageNode]);
