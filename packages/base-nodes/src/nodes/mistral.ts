import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

type ImageRefLike = { data?: string | Uint8Array; uri?: string };

function getApiKey(secrets: Record<string, string>): string {
  const key = secrets.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY || "";
  if (!key) throw new Error("Mistral API key not configured");
  return key;
}

function imageToDataUri(image: ImageRefLike): string {
  if (typeof image.data === "string") {
    return `data:image/png;base64,${image.data}`;
  }
  if (image.data instanceof Uint8Array) {
    return `data:image/png;base64,${Buffer.from(image.data).toString("base64")}`;
  }
  if (image.uri) return image.uri;
  throw new Error("Image must include data or uri");
}

async function mistralPost(
  apiKey: string,
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.mistral.ai/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mistral API error ${res.status}: ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// ── Chat Completion ─────────────────────────────────────────────────────────

export class ChatComplete extends BaseNode {
  static readonly nodeType = "mistral.text.ChatComplete";
  static readonly title = "Chat Complete";
  static readonly description =
    "Generate text using Mistral AI's chat completion models.\n    mistral, chat, ai, text generation, llm, completion\n\n    Uses Mistral AI's chat models to generate responses from prompts.\n    Requires a Mistral API key.\n\n    Use cases:\n    - Generate text responses to prompts\n    - Build conversational AI applications\n    - Code generation with Codestral\n    - Multi-modal understanding with Pixtral";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly basicFields = ["prompt", "model"];
  static readonly requiredSettings = ["MISTRAL_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "mistral-small-latest",
    title: "Model",
    description: "The Mistral model to use for generation",
    values: [
      "mistral-large-latest",
      "mistral-medium-latest",
      "mistral-small-latest",
      "pixtral-large-latest",
      "codestral-latest",
      "ministral-8b-latest",
      "ministral-3b-latest"
    ]
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
    max: 1
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 1024,
    title: "Max Tokens",
    description: "Maximum number of tokens to generate",
    min: 1,
    max: 32768
  })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const model = String(this.model ?? "mistral-small-latest");
    const systemPrompt = String(this.system_prompt ?? "");
    const temperature = Number(this.temperature ?? 0.7);
    const maxTokens = Number(this.max_tokens ?? 1024);

    const messages: Record<string, unknown>[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
    messages.push({ role: "user", content: prompt });

    const data = await mistralPost(apiKey, "chat/completions", {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    const choices = data.choices as
      | { message: { content: string | null } }[]
      | undefined;
    if (!choices || choices.length === 0)
      throw new Error("No response from Mistral API");

    return { output: choices[0].message.content ?? "" };
  }
}

// ── Code Completion ─────────────────────────────────────────────────────────

export class CodeComplete extends BaseNode {
  static readonly nodeType = "mistral.text.CodeComplete";
  static readonly title = "Code Complete";
  static readonly description =
    "Generate code using Mistral AI's Codestral model.\n    mistral, code, codestral, ai, programming, completion\n\n    Uses Mistral AI's Codestral model specifically designed for code generation.\n    Supports fill-in-the-middle (FIM) for code completion tasks.\n    Requires a Mistral API key.\n\n    Use cases:\n    - Generate code from natural language descriptions\n    - Complete partial code snippets\n    - Fill in code between prefix and suffix\n    - Automated code generation for various programming languages";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly basicFields = ["prompt", "suffix"];
  static readonly requiredSettings = ["MISTRAL_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The prompt or code prefix for generation"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Suffix",
    description: "Optional suffix for fill-in-the-middle completion"
  })
  declare suffix: any;

  @prop({
    type: "float",
    default: 0,
    title: "Temperature",
    description: "Sampling temperature. Lower values for code generation.",
    min: 0,
    max: 1
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 2048,
    title: "Max Tokens",
    description: "Maximum number of tokens to generate",
    min: 1,
    max: 32768
  })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const suffix = String(this.suffix ?? "");
    const temperature = Number(this.temperature ?? 0.0);
    const maxTokens = Number(this.max_tokens ?? 2048);
    const model = "codestral-latest";

    let data: Record<string, unknown>;

    if (suffix) {
      data = await mistralPost(apiKey, "fim/completions", {
        model,
        prompt,
        suffix,
        temperature,
        max_tokens: maxTokens
      });
    } else {
      data = await mistralPost(apiKey, "chat/completions", {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens
      });
    }

    const choices = data.choices as
      | { message: { content: string | null } }[]
      | undefined;
    if (!choices || choices.length === 0)
      throw new Error("No response from Mistral API");

    return { output: choices[0].message.content ?? "" };
  }
}

// ── Embeddings ──────────────────────────────────────────────────────────────

export class Embedding extends BaseNode {
  static readonly nodeType = "mistral.embeddings.Embedding";
  static readonly title = "Embedding";
  static readonly description =
    "Generate vector embeddings using Mistral AI.\n    mistral, embeddings, vectors, semantic, similarity, search\n\n    Uses Mistral AI's embedding model to create dense vector representations of text.\n    These vectors capture semantic meaning, enabling:\n    - Semantic search\n    - Text clustering\n    - Document classification\n    - Recommendation systems\n    - Measuring text similarity\n\n    Requires a Mistral API key.";
  static readonly metadataOutputTypes = {
    output: "list"
  };
  static readonly basicFields = ["input"];
  static readonly requiredSettings = ["MISTRAL_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Input",
    description: "The text to embed"
  })
  declare input: any;

  @prop({
    type: "enum",
    default: "mistral-embed",
    title: "Model",
    description: "The embedding model to use",
    values: ["mistral-embed"]
  })
  declare model: any;

  @prop({
    type: "int",
    default: 4096,
    title: "Chunk Size",
    description: "Size of text chunks for embedding",
    min: 1,
    max: 8192
  })
  declare chunk_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const input = String(this.input ?? "");
    if (!input) throw new Error("Input text cannot be empty");

    const model = String(this.model ?? "mistral-embed");
    const chunkSize = Number(this.chunk_size ?? 4096);

    // Chunk the input
    const chunks: string[] = [];
    for (let i = 0; i < input.length; i += chunkSize) {
      chunks.push(input.slice(i, i + chunkSize));
    }

    const data = await mistralPost(apiKey, "embeddings", {
      model,
      input: chunks
    });

    const embData = data.data as { embedding: number[] }[] | undefined;
    if (!embData || embData.length === 0)
      throw new Error("No embeddings from Mistral API");

    // Average embeddings if multiple chunks
    const dim = embData[0].embedding.length;
    const avg = new Array<number>(dim).fill(0);
    for (const item of embData) {
      for (let i = 0; i < dim; i++) {
        avg[i] += item.embedding[i];
      }
    }
    if (embData.length > 1) {
      for (let i = 0; i < dim; i++) {
        avg[i] /= embData.length;
      }
    }

    return { output: { data: avg, shape: [dim], dtype: "float32" } };
  }
}

// ── Image to Text ───────────────────────────────────────────────────────────

export class ImageToText extends BaseNode {
  static readonly nodeType = "mistral.vision.ImageToText";
  static readonly title = "Image To Text";
  static readonly description =
    "Analyze images and generate text descriptions using Mistral AI's Pixtral models.\n    mistral, pixtral, vision, image, ocr, analysis, multimodal\n\n    Uses Mistral AI's Pixtral vision models to understand and describe images.\n    Can perform OCR, image analysis, and answer questions about images.\n    Requires a Mistral API key.\n\n    Use cases:\n    - Extract text from images (OCR)\n    - Describe image contents\n    - Answer questions about images\n    - Analyze charts and diagrams\n    - Document understanding";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly basicFields = ["image", "prompt"];
  static readonly requiredSettings = ["MISTRAL_API_KEY"];
  static readonly exposeAsTool = true;

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
    type: "enum",
    default: "pixtral-large-latest",
    title: "Model",
    description: "The Pixtral model to use for vision tasks",
    values: ["pixtral-large-latest", "pixtral-12b-2409"]
  })
  declare model: any;

  @prop({
    type: "float",
    default: 0.3,
    title: "Temperature",
    description: "Sampling temperature for response generation",
    min: 0,
    max: 1
  })
  declare temperature: any;

  @prop({
    type: "int",
    default: 1024,
    title: "Max Tokens",
    description: "Maximum number of tokens to generate",
    min: 1,
    max: 16384
  })
  declare max_tokens: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const image = (this.image ?? {}) as ImageRefLike;
    if (!image.data && !image.uri) throw new Error("Image is required");

    const prompt = String(this.prompt ?? "Describe this image in detail.");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const model = String(this.model ?? "pixtral-large-latest");
    const temperature = Number(this.temperature ?? 0.3);
    const maxTokens = Number(this.max_tokens ?? 1024);

    const dataUri = imageToDataUri(image);

    const data = await mistralPost(apiKey, "chat/completions", {
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

    const choices = data.choices as
      | { message: { content: string | null } }[]
      | undefined;
    if (!choices || choices.length === 0)
      throw new Error("No response from Mistral API");

    return { output: choices[0].message.content ?? "" };
  }
}

// ── OCR ─────────────────────────────────────────────────────────────────────

export class OCR extends BaseNode {
  static readonly nodeType = "mistral.vision.OCR";
  static readonly title = "OCR";
  static readonly description =
    "Extract text from images using Mistral AI's Pixtral models.\n    mistral, pixtral, ocr, text extraction, document, image\n\n    Specialized node for optical character recognition (OCR) using Pixtral.\n    Optimized for extracting text content from documents, screenshots, and images.\n    Requires a Mistral API key.\n\n    Use cases:\n    - Extract text from scanned documents\n    - Read text from screenshots\n    - Digitize printed materials\n    - Extract data from forms and receipts";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly basicFields = ["image"];
  static readonly requiredSettings = ["MISTRAL_API_KEY"];
  static readonly exposeAsTool = true;

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
    description: "The image to extract text from"
  })
  declare image: any;

  @prop({
    type: "enum",
    default: "pixtral-large-latest",
    title: "Model",
    description: "The Pixtral model to use for OCR",
    values: ["pixtral-large-latest", "pixtral-12b-2409"]
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const image = (this.image ?? {}) as ImageRefLike;
    if (!image.data && !image.uri) throw new Error("Image is required");

    const model = String(this.model ?? "pixtral-large-latest");
    const dataUri = imageToDataUri(image);

    const data = await mistralPost(apiKey, "chat/completions", {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUri } },
            {
              type: "text",
              text:
                "Extract and return all text visible in this image. " +
                "Preserve the original formatting and structure as much as possible. " +
                "Return only the extracted text without any additional commentary."
            }
          ]
        }
      ],
      temperature: 0.0,
      max_tokens: 8192
    });

    const choices = data.choices as
      | { message: { content: string | null } }[]
      | undefined;
    if (!choices || choices.length === 0)
      throw new Error("No response from Mistral API");

    return { output: choices[0].message.content ?? "" };
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export const MISTRAL_NODES: readonly NodeClass[] = [
  ChatComplete,
  CodeComplete,
  Embedding,
  ImageToText,
  OCR
];
