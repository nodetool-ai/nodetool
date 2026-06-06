import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";

const XAI_API_BASE = "https://api.x.ai/v1";

type ImageRefLike = { data?: string | Uint8Array; uri?: string };

function getApiKey(secrets: Record<string, string>): string {
  const key = secrets.XAI_API_KEY || process.env.XAI_API_KEY || "";
  if (!key) throw new Error("XAI_API_KEY is not configured");
  return key;
}

function imageToDataUri(image: ImageRefLike): string {
  if (typeof image.data === "string") {
    if (image.data.startsWith("data:")) return image.data;
    return `data:image/png;base64,${image.data}`;
  }
  if (image.data instanceof Uint8Array) {
    return `data:image/png;base64,${Buffer.from(image.data).toString("base64")}`;
  }
  if (image.uri) return image.uri;
  throw new Error("Image must include data or uri");
}

async function xaiPost(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${XAI_API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`xAI API error ${res.status}: ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function firstMessageContent(data: Record<string, unknown>): string {
  const choices = data.choices as
    | { message?: { content?: string | null } }[]
    | undefined;
  if (!choices || choices.length === 0) {
    throw new Error("No response from xAI API");
  }
  return choices[0].message?.content ?? "";
}

// ── Chat Completion ─────────────────────────────────────────────────────────

export class ChatComplete extends BaseNode {
  static readonly nodeType = "xai.text.ChatComplete";
  static readonly body = "content_card";
  static readonly title = "Chat Complete";
  static readonly description =
    "Generate text using xAI's Grok chat completion models.\n    xai, grok, chat, ai, text generation, llm, completion\n\n    Uses xAI's Grok models to generate responses from prompts via the\n    OpenAI-compatible chat completions endpoint. Requires an xAI API key.\n\n    Use cases:\n    - Generate text responses to prompts\n    - Build conversational AI applications\n    - Summarize, rewrite, and classify text\n    - Reasoning tasks with Grok models";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["prompt", "system_prompt"];
  static readonly requiredSettings = ["XAI_API_KEY"];

  @prop({
    type: "str",
    default: "grok-4",
    title: "Model",
    description:
      "The Grok model to use (e.g. grok-4, grok-4.3, grok-3, grok-3-mini)."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The prompt for text generation"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "System Prompt",
    description: "Optional system prompt to guide the model's behavior"
  })
  declare system_prompt: any;

  @prop({
    type: "float",
    default: 0.7,
    title: "Temperature",
    description: "Sampling temperature. Higher values make output more random.",
    min: 0,
    max: 2
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 1024,
    title: "Max Tokens",
    description: "Maximum number of tokens to generate",
    min: 1,
    max: 131072
  })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const model = String(this.model ?? "grok-4");
    const systemPrompt = String(this.system_prompt ?? "");
    const temperature = Number(this.temperature ?? 0.7);
    const maxTokens = Number(this.max_tokens ?? 1024);

    const messages: Record<string, unknown>[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const data = await xaiPost(apiKey, "chat/completions", {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    return { output: firstMessageContent(data) };
  }
}

// ── Web Search (Live Search) ────────────────────────────────────────────────

export class WebSearch extends BaseNode {
  static readonly nodeType = "xai.text.WebSearch";
  static readonly body = "content_card";
  static readonly title = "Web Search";
  static readonly description =
    "Answer questions using Grok with xAI Live Search over the web and X.\n    xai, grok, search, web, live, realtime, citations\n\n    Uses xAI's Live Search (search_parameters) so Grok can pull in\n    real-time information from the web and X to answer the query.\n    Requires an xAI API key.\n\n    Use cases:\n    - Answer questions about current events\n    - Research with up-to-date sources\n    - Summarize recent news";
  static readonly metadataOutputTypes = {
    output: "str",
    citations: "list[str]"
  };
  static readonly inlineFields = ["query"];
  static readonly inputFields: string[] = [];
  static readonly requiredSettings = ["XAI_API_KEY"];

  @prop({
    type: "str",
    default: "grok-4",
    title: "Model",
    description: "The Grok model to use for the search query."
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "The question to research using live web/X search."
  })
  declare query: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Search Mode",
    description:
      "auto lets Grok decide when to search, on forces search, off disables it.",
    values: ["auto", "on", "off"]
  })
  declare search_mode: any;

  @prop({
    type: "int",
    default: 10,
    title: "Max Results",
    description: "Maximum number of search results to consider.",
    min: 1,
    max: 30
  })
  declare max_results: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const query = String(this.query ?? "");
    if (!query) throw new Error("Search query cannot be empty");

    const model = String(this.model ?? "grok-4");
    const mode = String(this.search_mode ?? "auto");
    const maxResults = Number(this.max_results ?? 10);

    const data = await xaiPost(apiKey, "chat/completions", {
      model,
      messages: [{ role: "user", content: query }],
      search_parameters: {
        mode,
        return_citations: true,
        max_search_results: maxResults
      }
    });

    // Live Search returns the source URLs as a top-level `citations` array.
    const citations = Array.isArray(data.citations)
      ? (data.citations as unknown[]).map((c) => String(c))
      : [];

    return { output: firstMessageContent(data), citations };
  }
}

// ── Image To Text (Vision) ──────────────────────────────────────────────────

export class ImageToText extends BaseNode {
  static readonly nodeType = "xai.vision.ImageToText";
  static readonly title = "Image To Text";
  static readonly description =
    "Analyze images and generate text using xAI's Grok vision models.\n    xai, grok, vision, image, ocr, analysis, multimodal\n\n    Uses Grok's multimodal models to understand and describe images via the\n    OpenAI-compatible chat completions endpoint. Can perform OCR, image\n    analysis, and answer questions about images. Requires an xAI API key.\n\n    Use cases:\n    - Describe image contents\n    - Answer questions about images\n    - Extract text from images (OCR)\n    - Analyze charts and diagrams";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt", "image"];
  static readonly requiredSettings = ["XAI_API_KEY"];

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
    description: "The image to analyze"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "Describe this image in detail.",
    title: "Prompt",
    description: "The prompt/question about the image"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "grok-2-vision-1212",
    title: "Model",
    description:
      "The Grok vision model to use (e.g. grok-2-vision-1212, grok-4)."
  })
  declare model: any;

  @prop({
    type: "float",
    default: 0.3,
    title: "Temperature",
    description: "Sampling temperature for response generation",
    min: 0,
    max: 2
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 1024,
    title: "Max Tokens",
    description: "Maximum number of tokens to generate",
    min: 1,
    max: 131072
  })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const image = (this.image ?? {}) as ImageRefLike;
    if (!image.data && !image.uri) throw new Error("Image is required");

    const prompt = String(this.prompt ?? "Describe this image in detail.");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const model = String(this.model ?? "grok-2-vision-1212");
    const temperature = Number(this.temperature ?? 0.3);
    const maxTokens = Number(this.max_tokens ?? 1024);

    const dataUri = imageToDataUri(image);

    const data = await xaiPost(apiKey, "chat/completions", {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUri } },
            { type: "text", text: prompt }
          ]
        }
      ],
      temperature,
      max_tokens: maxTokens
    });

    return { output: firstMessageContent(data) };
  }
}

// ── Image Generation ────────────────────────────────────────────────────────

export class GenerateImage extends BaseNode {
  static readonly nodeType = "xai.image.GenerateImage";
  static readonly body = "content_card";
  static readonly title = "Generate Image";
  static readonly description =
    "Generate images from text using xAI's Grok image models.\n    xai, grok, image, t2i, text-to-image, create, generate, picture, art\n\n    Uses xAI's OpenAI-compatible image generations endpoint. The model\n    automatically revises the prompt; the revised prompt is returned as a\n    second output. Requires an xAI API key.";
  static readonly metadataOutputTypes = {
    output: "image",
    revised_prompt: "str"
  };
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly requiredSettings = ["XAI_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "grok-2-image",
    title: "Model",
    description:
      "The Grok image model to use (e.g. grok-2-image, grok-imagine-image)."
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const model = String(this.model ?? "grok-2-image");

    // xAI's image endpoint mirrors OpenAI but rejects size/quality/style
    // params — only model, prompt, n and response_format are accepted.
    const data = await xaiPost(apiKey, "images/generations", {
      model,
      prompt,
      n: 1,
      response_format: "b64_json"
    });

    const items = data.data as
      | Array<{ b64_json?: string; url?: string; revised_prompt?: string }>
      | undefined;
    if (!items || items.length === 0) {
      throw new Error("No image data in xAI response");
    }

    const item = items[0];
    const revisedPrompt = item.revised_prompt ?? "";
    if (item.b64_json) {
      return {
        output: { type: "image", data: `data:image/png;base64,${item.b64_json}` },
        revised_prompt: revisedPrompt
      };
    }
    if (item.url) {
      return {
        output: { type: "image", uri: item.url },
        revised_prompt: revisedPrompt
      };
    }
    throw new Error("No image data in xAI response");
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export const XAI_NODES = tagAsServer([
  ChatComplete,
  WebSearch,
  ImageToText,
  GenerateImage
]);
