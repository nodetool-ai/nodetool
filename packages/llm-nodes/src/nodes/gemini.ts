import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ImageRef, AudioRef } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { loadMediaRefBytes, safeFetch } from "@nodetool-ai/runtime";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { sleep } from "@nodetool-ai/runtime/provider-transport";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  modelIdOf,
  providerModelProp,
  type ModelFieldValue
} from "./provider-model-prop.js";
import {
  isNonEmptyString,
  isObjectLike,
  isString
} from "@nodetool-ai/node-sdk";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function getGeminiApiKey(secrets: Record<string, string>): string {
  const key = secrets.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

/**
 * Where a Gemini node sends its requests. The request and response bodies are
 * the same on the Gemini Developer API and on Vertex AI, so a node builds them
 * once and only the endpoint differs.
 */
export interface GeminiEndpoint {
  /** Names the API in error messages. */
  readonly label: string;
  postModel(
    model: string,
    method: string,
    body: unknown,
    signal?: AbortSignal
  ): Promise<Response>;
  getVideoOperation(
    model: string,
    operationName: string,
    signal?: AbortSignal
  ): Promise<Response>;
  mediaHeaders(uri: string): Promise<Record<string, string> | undefined>;
}

/** The Gemini Developer API, authenticated with an AI Studio key. */
function apiKeyEndpoint(apiKey: string): GeminiEndpoint {
  return {
    label: "Gemini API",
    postModel: (model, method, body, signal) =>
      fetch(`${GEMINI_API_BASE}/models/${model}:${method}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal
      }),
    getVideoOperation: (_model, operationName, signal) =>
      fetch(`${GEMINI_API_BASE}/${operationName}?key=${apiKey}`, { signal }),
    mediaHeaders: async (uri) =>
      new URL(uri).hostname === "generativelanguage.googleapis.com"
        ? { "x-goog-api-key": apiKey }
        : undefined
  };
}

function isGeminiEndpoint(value: unknown): value is Omit<GeminiEndpoint, "label"> {
  if (!isObjectLike(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.postModel === "function" &&
    typeof v.getVideoOperation === "function" &&
    typeof v.mediaHeaders === "function"
  );
}

/**
 * A node's model: an enum id on the Gemini nodes, or a model picked from the
 * provider's own listing on the Vertex AI nodes.
 */
type GeminiModelValue = ModelFieldValue;

function requireModelId(value: GeminiModelValue): string {
  const id = modelIdOf(value);
  if (!id) throw new Error("Select a model");
  return id;
}

/** A Gemini node class. Vertex AI subclasses set `geminiProvider`. */
type GeminiNodeClass = { geminiProvider?: string };

/**
 * The endpoint a Gemini node uses: the AI Studio key by default, or the
 * registry provider a subclass names, which brings its own credentials.
 */
async function geminiEndpoint(
  node: BaseNode,
  secrets: Record<string, string>,
  context?: ProcessingContext
): Promise<GeminiEndpoint> {
  const providerId = (node.constructor as GeminiNodeClass).geminiProvider;
  if (!providerId) return apiKeyEndpoint(getGeminiApiKey(secrets));
  if (!context) {
    throw new Error(`${providerId} nodes need a processing context`);
  }
  const provider = await context.getProvider(providerId);
  if (!isGeminiEndpoint(provider)) {
    throw new Error(`Provider ${providerId} does not serve Gemini requests`);
  }
  return {
    label: "Vertex AI",
    postModel: (model, method, body, signal) =>
      provider.postModel(model, method, body, signal),
    getVideoOperation: (model, operationName, signal) =>
      provider.getVideoOperation(model, operationName, signal),
    mediaHeaders: (uri) => provider.mediaHeaders(uri)
  };
}

type MediaRefLike = { uri?: string; asset_id?: string | null; data?: unknown };

/**
 * Bytes behind a media ref: inline `data`, an `asset://` URI or bare
 * `asset_id`, a storage URI, or an http(s) URL. Empty when nothing resolves.
 */
async function getMediaBytes(
  ref: MediaRefLike,
  type: "image" | "audio",
  context?: ProcessingContext
): Promise<Uint8Array | null> {
  const bytes = await loadMediaRefBytes(
    { data: ref.data, uri: ref.uri, asset_id: ref.asset_id, type },
    context
  );
  return bytes && bytes.length > 0 ? bytes : null;
}

function isRefSet(ref: unknown): boolean {
  if (!isObjectLike(ref)) return false;
  const r = ref as Record<string, unknown>;
  return Boolean(r.data || r.uri || r.asset_id);
}

// ── Text nodes ──────────────────────────────────────────────────────────────

/** Output handles GroundedSearchNode.process() emits. */
type GroundedSearchNodeOutputs = {
  results: string[];
  sources: { title: string; url: string }[];
  text: string;
};

export class GroundedSearchNode extends BaseNode {
  static readonly nodeType: string = "gemini.text.GroundedSearch";
  static readonly body = "content_card";
  static readonly primaryOutput = "text";
  static readonly title = "Grounded Search";
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["query"];
  static readonly description: string =
    "Search the web using Google's Gemini API with grounding capabilities.\n    google, search, grounded, web, gemini, ai\n\n    This node uses Google's Gemini API to perform web searches and return structured results\n    with source information. Requires a Gemini API key.\n\n    Use cases:\n    - Research current events and latest information\n    - Find reliable sources for fact-checking\n    - Gather web-based information with citations\n    - Get up-to-date information beyond the model's training data";
  static readonly metadataOutputTypes = {
    results: "list[str]",
    sources: "list[source]",
    text: "str"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "The search query to execute"
  })
  declare query: string;

  @prop({
    type: "enum",
    default: "gemini-3.5-flash",
    title: "Model",
    description: "The Gemini model to use for search",
    values: [
      "gemini-3.5-flash",
      "gemini-3.1-pro-preview",
      "gemini-3.1-flash-lite",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite"
    ]
  })
  declare model: GeminiModelValue;

  async process(
    context?: ProcessingContext
  ): Promise<GroundedSearchNodeOutputs> {
    const endpoint = await geminiEndpoint(this, this._secrets, context);
    const query = this.query;
    const model = requireModelId(this.model);

    if (!query) throw new Error("Search query is required");

    const method = "generateContent";
    const body = {
      contents: [{ parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        responseMimeType: "text/plain"
      }
    };

    const res = await endpoint.postModel(model, method, body);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    const candidates = data.candidates as
      | Array<Record<string, unknown>>
      | undefined;
    if (!candidates || candidates.length === 0) {
      throw new Error("No response received from Gemini API");
    }

    const candidate = candidates[0];
    const content = candidate.content as Record<string, unknown> | undefined;
    if (!content) throw new Error("Invalid response format from Gemini API");

    const parts = content.parts as Array<Record<string, unknown>> | undefined;
    const results: string[] = [];
    if (parts) {
      for (const part of parts) {
        if (isString(part.text)) {
          results.push(part.text);
        }
      }
    }

    const sources: Array<{ title: string; url: string }> = [];
    const groundingMetadata = candidate.groundingMetadata as
      | Record<string, unknown>
      | undefined;
    if (groundingMetadata) {
      const chunks = groundingMetadata.groundingChunks as
        | Array<Record<string, unknown>>
        | undefined;
      if (chunks) {
        for (const chunk of chunks) {
          const web = chunk.web as Record<string, unknown> | undefined;
          if (web) {
            const source = {
              title: String(web.title ?? ""),
              url: String(web.uri ?? "")
            };
            if (source.url && !sources.some((s) => s.url === source.url)) {
              sources.push(source);
            }
          }
        }
      }
    }

    return { results, sources, text: results.join("\n") };
  }
}

export class EmbeddingNode extends BaseNode {
  static readonly nodeType: string = "gemini.text.Embedding";
  static readonly title = "Embedding";
  static readonly inlineFields = ["input"];
  static readonly inputFields: string[] = [];
  static readonly description: string =
    "Generate vector representations of text for semantic analysis using Google's Gemini API.\n    embeddings, similarity, search, clustering, classification, gemini\n\n    Uses Google's text embedding models to create dense vector representations of text.\n    These vectors capture semantic meaning, enabling:\n    - Semantic search\n    - Text clustering\n    - Document classification\n    - Recommendation systems\n    - Anomaly detection\n    - Measuring text similarity and diversity";
  static readonly metadataOutputTypes = {
    output: "list"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Input",
    description: "The text to embed."
  })
  declare input: string;

  @prop({
    type: "enum",
    default: "gemini-embedding-2",
    title: "Model",
    description: "The embedding model to use",
    values: ["gemini-embedding-2"]
  })
  declare model: GeminiModelValue;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const endpoint = await geminiEndpoint(this, this._secrets, context);
    const input = this.input;
    const model = requireModelId(this.model);

    if (!input)
      throw new Error("Input text is required for embedding generation");

    const method = "embedContent";
    const body = {
      content: { parts: [{ text: input }] }
    };

    const res = await endpoint.postModel(model, method, body);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const embedding = data.embedding as Record<string, unknown> | undefined;
    if (!embedding || !embedding.values) {
      throw new Error("No embedding generated from the input text");
    }

    return { output: embedding.values };
  }
}

// ── Image nodes ─────────────────────────────────────────────────────────────

/** Output handles ImageGenerationNode.process() emits. */
type ImageGenerationNodeOutputs = {
  output: { type: string; data: string };
};

export class ImageGenerationNode extends BaseNode {
  static readonly nodeType: string = "gemini.image.ImageGeneration";
  static readonly body = "content_card";
  static readonly title = "Image Generation";
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt", "image"];
  static readonly description: string =
    "Generate an image using Google's Imagen model via the Gemini API.\n    google, image generation, ai, imagen\n\n    Use cases:\n    - Create images from text descriptions\n    - Generate assets for creative projects\n    - Explore AI-powered image synthesis";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: string;

  @prop({
    type: "enum",
    default: "gemini-3.1-flash-image",
    title: "Model",
    description: "The image generation model to use",
    values: [
      "gemini-3.1-flash-image",
      "gemini-nano-banana-2.1",
      "gemini-3.1-flash-lite-image",
      "gemini-3-pro-image",
      "imagen-4.0-generate-001"
    ]
  })
  declare model: GeminiModelValue;

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
    description: "The image to use as a base for the generation."
  })
  declare image: ImageRef;

  @prop({
    type: "enum",
    default: "1:1",
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated image",
    values: [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9"
    ]
  })
  declare aspect_ratio: string;

  @prop({
    type: "enum",
    default: "1K",
    title: "Resolution",
    description: "The output image resolution",
    values: ["512px", "1K", "2K", "4K"]
  })
  declare resolution: string;

  async process(
    context?: ProcessingContext
  ): Promise<ImageGenerationNodeOutputs> {
    const endpoint = await geminiEndpoint(this, this._secrets, context);
    const prompt = this.prompt;
    const model = requireModelId(this.model);
    const image = this.image;
    const aspectRatio = this.aspect_ratio;
    const resolution = this.resolution;

    if (!prompt) throw new Error("The input prompt cannot be empty.");

    if (model.startsWith("gemini-")) {
      const contentParts: Array<Record<string, unknown>> = [{ text: prompt }];

      const imageBytes = isRefSet(image)
        ? await getMediaBytes(image, "image", context)
        : null;
      if (isRefSet(image) && !imageBytes) {
        throw new Error("Input image could not be resolved");
      }
      if (imageBytes) {
        contentParts.push({
          inlineData: {
            mimeType: "image/png",
            data: Buffer.from(imageBytes).toString("base64")
          }
        });
      }

      const method = "generateContent";
      const body = {
        contents: [{ parts: contentParts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          imageConfig: {
            aspectRatio,
            imageSize: resolution
          }
        }
      };

      const res = await endpoint.postModel(model, method, body);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as Record<string, unknown>;
      const candidates = data.candidates as
        | Array<Record<string, unknown>>
        | undefined;
      if (!candidates || candidates.length === 0) {
        throw new Error("No response received from Gemini API");
      }

      const candidate = candidates[0];

      if (candidate.finishReason === "PROHIBITED_CONTENT") {
        throw new Error("Prohibited content in the input prompt");
      }

      const content = candidate.content as Record<string, unknown> | undefined;
      const parts = content?.parts as
        | Array<Record<string, unknown>>
        | undefined;
      if (!parts) throw new Error("Invalid response format from Gemini API");

      for (const part of parts) {
        const inlineData = part.inlineData as
          | Record<string, unknown>
          | undefined;
        const inlineData2 = part.inline_data as
          | Record<string, unknown>
          | undefined;
        const d = inlineData ?? inlineData2;
        if (d && isString(d.data)) {
          return { output: { type: "image", data: d.data } };
        }
      }

      throw new Error("No image bytes returned in response");
    }

    const method = "predict";
    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio }
    };

    const res = await endpoint.postModel(model, method, body);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;

    const predictionBytes = (
      data.predictions as Array<{ bytesBase64Encoded?: string }> | undefined
    )?.[0]?.bytesBase64Encoded;
    if (predictionBytes) {
      return { output: { type: "image", data: predictionBytes } };
    }

    const generatedImages = data.generatedImages as
      | Array<Record<string, unknown>>
      | undefined;
    if (!generatedImages || generatedImages.length === 0) {
      throw new Error("No images generated");
    }

    const imgObj = generatedImages[0].image as
      | Record<string, unknown>
      | undefined;
    if (!imgObj) throw new Error("No image in response");

    const imageBytes = imgObj.imageBytes as string | undefined;
    if (!imageBytes) throw new Error("No image bytes in response");

    return { output: { type: "image", data: imageBytes } };
  }
}

// ── Video nodes ─────────────────────────────────────────────────────────────

/** Output handles TextToVideoGeminiNode.process() emits. */
type TextToVideoGeminiNodeOutputs = {
  output: { type: string; data: string };
};

export class TextToVideoGeminiNode extends BaseNode {
  static readonly nodeType: string = "gemini.video.TextToVideo";
  static readonly body = "content_card";
  static readonly title = "Text To Video";
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly description: string =
    "Generate videos from text prompts using Google's Veo models.\n    google, video, generation, text-to-video, veo, ai\n\n    This node uses Google's Veo models to generate high-quality videos from text descriptions.\n    Supports 720p resolution at 24fps with 8-second duration and native audio generation.";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the video to generate"
  })
  declare prompt: string;

  @prop({
    type: "enum",
    default: "veo-3.1-generate-preview",
    title: "Model",
    description: "The Veo model to use for video generation",
    values: [
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview",
      "veo-3.1-lite-generate-preview"
    ]
  })
  declare model: GeminiModelValue;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video",
    values: ["16:9", "9:16"]
  })
  declare aspect_ratio: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Negative prompt to guide what to avoid in the video"
  })
  declare negative_prompt: string;

  @prop({
    type: "enum",
    default: "720p",
    title: "Resolution",
    description: "The output video resolution",
    values: ["720p", "1080p", "4k"]
  })
  declare resolution: string;

  async process(
    context?: ProcessingContext
  ): Promise<TextToVideoGeminiNodeOutputs> {
    const endpoint = await geminiEndpoint(this, this._secrets, context);
    const prompt = this.prompt;
    const model = requireModelId(this.model);
    const aspectRatio = this.aspect_ratio;
    const negativePrompt = this.negative_prompt;
    const resolution = this.resolution;

    if (!prompt) throw new Error("Video generation prompt is required");

    const method = "predictLongRunning";
    const parameters: Record<string, unknown> = {};
    if (aspectRatio) parameters.aspectRatio = aspectRatio;
    if (negativePrompt) parameters.negativePrompt = negativePrompt;
    if (resolution) parameters.resolution = resolution;

    const body: Record<string, unknown> = {
      instances: [{ prompt }]
    };
    if (Object.keys(parameters).length > 0) body.parameters = parameters;

    const res = await endpoint.postModel(model, method, body, context?.signal);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
    }

    const operation = (await res.json()) as Record<string, unknown>;
    const videoData = await pollVideoOperation(
      endpoint,
      model,
      operation,
      context?.signal
    );
    return { output: { type: "video", data: videoData } };
  }
}

/** Output handles ImageToVideoGeminiNode.process() emits. */
type ImageToVideoGeminiNodeOutputs = {
  output: { type: string; data: string };
};

export class ImageToVideoGeminiNode extends BaseNode {
  static readonly nodeType: string = "gemini.video.ImageToVideo";
  static readonly body = "content_card";
  static readonly title = "Image To Video";
  static readonly inlineFields = [];
  static readonly inputFields = ["prompt", "image"];
  static readonly description: string =
    "Generate videos from images using Google's Veo models.\n    google, video, generation, image-to-video, veo, ai, animation\n\n    This node uses Google's Veo models to animate static images into dynamic videos.\n    Supports 720p resolution at 24fps with 8-second duration and native audio generation.";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly autoSaveAsset = true;

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
    description: "The image to animate into a video"
  })
  declare image: ImageRef;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Optional text prompt describing the desired animation"
  })
  declare prompt: string;

  @prop({
    type: "enum",
    default: "veo-3.1-generate-preview",
    title: "Model",
    description: "The Veo model to use for video generation",
    values: [
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview",
      "veo-3.1-lite-generate-preview"
    ]
  })
  declare model: GeminiModelValue;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video",
    values: ["16:9", "9:16"]
  })
  declare aspect_ratio: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Negative prompt to guide what to avoid in the video"
  })
  declare negative_prompt: string;

  @prop({
    type: "enum",
    default: "720p",
    title: "Resolution",
    description: "The output video resolution",
    values: ["720p", "1080p", "4k"]
  })
  declare resolution: string;

  async process(
    context?: ProcessingContext
  ): Promise<ImageToVideoGeminiNodeOutputs> {
    const endpoint = await geminiEndpoint(this, this._secrets, context);
    const image = this.image;
    const prompt = this.prompt;
    const model = requireModelId(this.model);
    const aspectRatio = this.aspect_ratio;
    const negativePrompt = this.negative_prompt;
    const resolution = this.resolution;

    if (!isRefSet(image)) throw new Error("Input image is required");

    const imageBytes = await getMediaBytes(image, "image", context);
    if (!imageBytes) throw new Error("Image data is required");

    const parameters: Record<string, unknown> = {};
    if (aspectRatio) parameters.aspectRatio = aspectRatio;
    if (negativePrompt) parameters.negativePrompt = negativePrompt;
    if (resolution) parameters.resolution = resolution;

    const method = "predictLongRunning";
    const body: Record<string, unknown> = {
      instances: [
        {
          prompt: prompt || "Animate this image",
          image: {
            bytesBase64Encoded: Buffer.from(imageBytes).toString("base64"),
            mimeType: "image/png"
          }
        }
      ]
    };
    if (Object.keys(parameters).length > 0) body.parameters = parameters;

    const res = await endpoint.postModel(model, method, body, context?.signal);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
    }

    const operation = (await res.json()) as Record<string, unknown>;
    const videoData = await pollVideoOperation(
      endpoint,
      model,
      operation,
      context?.signal
    );
    return { output: { type: "video", data: videoData } };
  }
}

async function pollVideoOperation(
  endpoint: GeminiEndpoint,
  model: string,
  operation: Record<string, unknown>,
  signal?: AbortSignal
): Promise<string> {
  const initialError = operation.error as Record<string, unknown> | undefined;
  if (initialError) {
    throw new Error(
      `Gemini video generation failed: ${String(initialError.message ?? initialError.status ?? "unknown error")}`
    );
  }
  if (operation.done) {
    return extractVideoFromResponse(endpoint, operation);
  }

  const opName = operation.name as string | undefined;
  if (!opName) throw new Error("No operation name in response");

  const maxAttempts = 120; // 10 minutes at 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    // A cancelled run stops polling the paid operation.
    signal?.throwIfAborted();
    await sleep(5000, signal);
    signal?.throwIfAborted();

    const pollRes = await endpoint.getVideoOperation(model, opName, signal);
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`Gemini poll error ${pollRes.status}: ${errText}`);
    }

    const pollData = (await pollRes.json()) as Record<string, unknown>;
    const pollError = pollData.error as Record<string, unknown> | undefined;
    if (pollError) {
      throw new Error(
        `Gemini video generation failed: ${String(pollError.message ?? pollError.status ?? "unknown error")}`
      );
    }
    if (pollData.done) {
      return extractVideoFromResponse(endpoint, pollData);
    }
  }

  throw new Error("Video generation timed out");
}

async function extractVideoFromResponse(
  endpoint: GeminiEndpoint,
  data: Record<string, unknown>
): Promise<string> {
  const response = (data.response ?? data) as Record<string, unknown>;
  // Vertex AI returns the video inline: `response.videos[].bytesBase64Encoded`.
  const vertexVideos = response.videos as
    | Array<{ bytesBase64Encoded?: unknown; gcsUri?: unknown }>
    | undefined;
  const inlineVideo = vertexVideos?.[0]?.bytesBase64Encoded;
  if (isNonEmptyString(inlineVideo)) return inlineVideo;
  if (vertexVideos?.[0]?.gcsUri) {
    throw new Error(
      "Vertex AI wrote the video to Cloud Storage, which this node cannot read"
    );
  }
  const directVideos = response.generatedVideos as
    | Array<Record<string, unknown>>
    | undefined;
  const generateVideoResponse = response.generateVideoResponse as
    | Record<string, unknown>
    | undefined;
  const generatedSamples = generateVideoResponse?.generatedSamples as
    | Array<Record<string, unknown>>
    | undefined;
  const generatedVideos = directVideos ?? generatedSamples;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error("No video generated");
  }

  const video = generatedVideos[0].video as Record<string, unknown> | undefined;
  if (!video) throw new Error("No video in response");

  const videoBytes = video.videoBytes as string | undefined;
  if (videoBytes) return videoBytes;

  const videoUri = video.uri as string | undefined;
  if (videoUri) {
    const headers = await endpoint.mediaHeaders(videoUri);
    const dlRes = await safeFetch(videoUri, {
      headers
    });
    if (!dlRes.ok) {
      throw new Error(`${endpoint.label} video download failed ${dlRes.status}`);
    }
    return Buffer.from(await dlRes.arrayBuffer()).toString("base64");
  }

  throw new Error("No video bytes in response");
}

// ── Audio nodes ─────────────────────────────────────────────────────────────

/** Output handles TextToSpeechGeminiNode.process() emits. */
type TextToSpeechGeminiNodeOutputs = {
  output: { type: string; uri: string; data: string };
};

export class TextToSpeechGeminiNode extends BaseNode {
  static readonly nodeType: string = "gemini.audio.TextToSpeech";
  static readonly body = "content_card";
  static readonly title = "Text To Speech";
  static readonly inlineFields = [];
  static readonly inputFields: string[] = ["text"];
  static readonly description: string =
    "Generate speech audio from text using Google's Gemini text-to-speech models.\n    google, text-to-speech, tts, audio, speech, voice, ai\n\n    This node converts text input into natural-sounding speech audio using Google's\n    advanced text-to-speech models with support for multiple voices and speech styles.\n\n    Supported voices:\n    - achernar, achird, algenib, algieba, alnilam\n    - aoede, autonoe, callirrhoe, charon, despina\n    - enceladus, erinome, fenrir, gacrux, iapetus\n    - kore, laomedeia, leda, orus, puck\n    - pulcherrima, rasalgethi, sadachbia, sadaltager, schedar\n    - sulafat, umbriel, vindemiatrix, zephyr, zubenelgenubi\n\n    Use cases:\n    - Create voiceovers for videos and presentations\n    - Generate audio content for podcasts and audiobooks\n    - Add voice narration to applications\n    - Create accessibility features with speech output\n    - Generate multilingual audio content";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to convert to speech."
  })
  declare text: string;

  @prop({
    type: "enum",
    default: "gemini-3.8-flash-tts",
    title: "Model",
    description: "The text-to-speech model to use",
    values: [
      "gemini-3.8-flash-tts",
      "gemini-3.8-flash-lite-tts",
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts"
    ]
  })
  declare model: GeminiModelValue;

  @prop({
    type: "enum",
    default: "kore",
    title: "Voice Name",
    description: "The voice to use for speech generation",
    values: [
      "achernar",
      "achird",
      "algenib",
      "algieba",
      "alnilam",
      "aoede",
      "autonoe",
      "callirrhoe",
      "charon",
      "despina",
      "enceladus",
      "erinome",
      "fenrir",
      "gacrux",
      "iapetus",
      "kore",
      "laomedeia",
      "leda",
      "orus",
      "puck",
      "pulcherrima",
      "rasalgethi",
      "sadachbia",
      "sadaltager",
      "schedar",
      "sulafat",
      "umbriel",
      "vindemiatrix",
      "zephyr",
      "zubenelgenubi"
    ]
  })
  declare voice_name: string;

  @prop({
    type: "str",
    default: "",
    title: "Style Prompt",
    description:
      "Optional style prompt to control speech characteristics (e.g., 'Say cheerfully', 'Speak with excitement')"
  })
  declare style_prompt: string;

  async process(
    context?: ProcessingContext
  ): Promise<TextToSpeechGeminiNodeOutputs> {
    const endpoint = await geminiEndpoint(this, this._secrets, context);
    const text = this.text;
    const model = requireModelId(this.model);
    const stylePrompt = this.style_prompt;

    const VALID_VOICES = [
      "achernar", "achird", "algenib", "algieba", "alnilam",
      "aoede", "autonoe", "callirrhoe", "charon", "despina",
      "enceladus", "erinome", "fenrir", "gacrux", "iapetus",
      "kore", "laomedeia", "leda", "orus", "puck",
      "pulcherrima", "rasalgethi", "sadachbia", "sadaltager", "schedar",
      "sulafat", "umbriel", "vindemiatrix", "zephyr", "zubenelgenubi"
    ];
    const rawVoice = this.voice_name.toLowerCase();
    const voiceName = VALID_VOICES.includes(rawVoice) ? rawVoice : "kore";

    if (!text) throw new Error("The input text cannot be empty.");

    let content = text;
    if (stylePrompt) {
      content = `${stylePrompt}: ${text}`;
    }

    const method = "generateContent";
    const body = {
      contents: [{ parts: [{ text: content }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceName
            }
          }
        }
      }
    };

    const res = await endpoint.postModel(model, method, body);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const candidates = data.candidates as
      | Array<Record<string, unknown>>
      | undefined;
    if (!candidates || candidates.length === 0) {
      throw new Error("No audio generated from the text-to-speech request");
    }

    const candidate = candidates[0];
    const contentObj = candidate.content as Record<string, unknown> | undefined;
    const parts = contentObj?.parts as
      | Array<Record<string, unknown>>
      | undefined;
    if (!parts)
      throw new Error("No audio generated from the text-to-speech request");

    for (const part of parts) {
      const inlineData =
        (part.inlineData as Record<string, unknown> | undefined) ??
        (part.inline_data as Record<string, unknown> | undefined);
      if (inlineData && isString(inlineData.data)) {
        // The API returns raw PCM audio at 24kHz, 16-bit mono
        // Encode as WAV for the audio ref
        const pcmBase64 = inlineData.data;
        const pcmBytes = Buffer.from(pcmBase64, "base64");
        const wavBytes = encodeWav(pcmBytes, 24000, 1, 16);
        return {
          output: {
            type: "audio",
            uri: "",
            data: Buffer.from(wavBytes).toString("base64")
          }
        };
      }
    }

    throw new Error("No audio data found in the response");
  }
}

/** Output handles TranscribeGeminiNode.process() emits. */
type TranscribeGeminiNodeOutputs = {
  output: string;
};

export class TranscribeGeminiNode extends BaseNode {
  static readonly nodeType: string = "gemini.audio.Transcribe";
  static readonly body = "content_card";
  static readonly title = "Transcribe";
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["audio", "prompt"];
  static readonly description: string =
    "Transcribe audio to text using Google's Gemini models.\n    google, transcription, speech-to-text, audio, whisper, ai\n\n    This node converts audio input into text using Google's multimodal Gemini models.\n    Supports various audio formats and provides accurate speech-to-text transcription.\n\n    Use cases:\n    - Convert recorded audio to text\n    - Transcribe podcasts and interviews\n    - Generate subtitles from audio tracks\n    - Create meeting notes from audio recordings\n    - Analyze speech content in audio files";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];

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
    description: "The audio file to transcribe."
  })
  declare audio: AudioRef;

  @prop({
    type: "enum",
    default: "gemini-3.5-flash",
    title: "Model",
    description: "The Gemini model to use for transcription",
    values: ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"]
  })
  declare model: GeminiModelValue;

  @prop({
    type: "str",
    default:
      "Transcribe the following audio accurately. Return only the transcription text without any additional commentary.",
    title: "Prompt",
    description:
      "Instructions for the transcription. You can customize this to request specific formatting or focus."
  })
  declare prompt: string;

  async process(
    context?: ProcessingContext
  ): Promise<TranscribeGeminiNodeOutputs> {
    const endpoint = await geminiEndpoint(this, this._secrets, context);
    const audio = this.audio;
    const model = requireModelId(this.model);
    const prompt = this.prompt;

    if (!isRefSet(audio))
      throw new Error("Audio file is required for transcription");

    const audioBytes = await getMediaBytes(audio, "audio", context);
    if (!audioBytes) throw new Error("Audio data is required");

    // Detect MIME type from first bytes (simple magic-number check)
    const mimeType = detectAudioMime(audioBytes);

    const method = "generateContent";
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType,
                data: Buffer.from(audioBytes).toString("base64")
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT"]
      }
    };

    const res = await endpoint.postModel(model, method, body);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`${endpoint.label} error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const candidates = data.candidates as
      | Array<Record<string, unknown>>
      | undefined;
    if (!candidates || candidates.length === 0) {
      throw new Error("No transcription generated from the audio");
    }

    const candidate = candidates[0];
    const content = candidate.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    if (!parts) throw new Error("No transcription generated from the audio");

    const transcriptionParts: string[] = [];
    for (const part of parts) {
      if (isString(part.text)) {
        transcriptionParts.push(part.text);
      }
    }

    return { output: transcriptionParts.join("") };
  }
}

// ── Utility functions ───────────────────────────────────────────────────────

function detectAudioMime(bytes: Uint8Array): string {
  if (bytes.length < 4) return "audio/mpeg";
  // WAV: RIFF header
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    return "audio/wav";
  }
  // FLAC
  if (
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return "audio/flac";
  }
  // OGG
  if (
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return "audio/ogg";
  }
  // MP3 frame sync or ID3 tag
  if (
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
  ) {
    return "audio/mpeg";
  }
  return "audio/mpeg";
}

export function encodeWav(
  pcmData: Uint8Array | Buffer,
  sampleRate: number,
  channels: number,
  bitsPerSample: number
): Uint8Array {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);
  const out = new Uint8Array(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  // fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);
  out.set(
    pcmData instanceof Buffer ? new Uint8Array(pcmData) : pcmData,
    headerSize
  );

  return out;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ── Vertex AI ───────────────────────────────────────────────────────────────
//
// The same nodes, sent to Gemini on Vertex AI (the "Gemini (Google Cloud)"
// provider) and billed to a Google Cloud project. Each keeps its parent's
// fields and request bodies. Only the endpoint, the credentials and the model
// field change: the model is picked from the Vertex AI provider's own listing
// instead of a fixed list.

const VERTEX = PROVIDER_IDS.GEMINI_VERTEX;
const VERTEX_SETTINGS = ["GOOGLE_CLOUD_PROJECT"];
const VERTEX_TAGS = "vertex, google cloud, gcp, gemini";

/** A model field whose picker lists only the Vertex AI provider's models. */
const vertexModel = (type: string, id: string, description: string) =>
  providerModelProp(type, VERTEX, id, description);

export class VertexGroundedSearchNode extends GroundedSearchNode {
  static readonly nodeType = "vertex.text.GroundedSearch";
  static readonly geminiProvider = VERTEX;
  static readonly requiredSettings = VERTEX_SETTINGS;
  static readonly description = `Search the web with Gemini on Vertex AI, grounded in Google Search results, billed to your Google Cloud project.\n    ${VERTEX_TAGS}, search, grounding, web, sources`;

  @vertexModel("language_model", "gemini-3.5-flash", "The Gemini model that searches.")
  declare model: GeminiModelValue;
}

export class VertexEmbeddingNode extends EmbeddingNode {
  static readonly nodeType = "vertex.text.Embedding";
  static readonly geminiProvider = VERTEX;
  static readonly requiredSettings = VERTEX_SETTINGS;
  static readonly description = `Embed text as a vector with Gemini embedding models on Vertex AI, billed to your Google Cloud project.\n    ${VERTEX_TAGS}, embeddings, similarity, search, clustering`;

  @vertexModel("embedding_model", "gemini-embedding-2", "The embedding model.")
  declare model: GeminiModelValue;
}

export class VertexImageGenerationNode extends ImageGenerationNode {
  static readonly nodeType = "vertex.image.ImageGeneration";
  static readonly geminiProvider = VERTEX;
  static readonly requiredSettings = VERTEX_SETTINGS;
  static readonly description = `Generate or edit an image with Gemini image models or Imagen on Vertex AI, billed to your Google Cloud project.\n    ${VERTEX_TAGS}, image, generation, nano banana, imagen`;

  @vertexModel("image_model", "gemini-3.1-flash-image", "The image model.")
  declare model: GeminiModelValue;
}

export class VertexTextToVideoNode extends TextToVideoGeminiNode {
  static readonly nodeType = "vertex.video.TextToVideo";
  static readonly geminiProvider = VERTEX;
  static readonly requiredSettings = VERTEX_SETTINGS;
  static readonly description = `Generate a video from a text prompt with Veo on Vertex AI, billed to your Google Cloud project.\n    ${VERTEX_TAGS}, video, generation, veo, text-to-video`;

  @vertexModel("video_model", "veo-3.1-generate-preview", "The Veo model.")
  declare model: GeminiModelValue;
}

export class VertexImageToVideoNode extends ImageToVideoGeminiNode {
  static readonly nodeType = "vertex.video.ImageToVideo";
  static readonly geminiProvider = VERTEX;
  static readonly requiredSettings = VERTEX_SETTINGS;
  static readonly description = `Animate an image into a video with Veo on Vertex AI, billed to your Google Cloud project.\n    ${VERTEX_TAGS}, video, generation, veo, image-to-video`;

  @vertexModel("video_model", "veo-3.1-generate-preview", "The Veo model.")
  declare model: GeminiModelValue;
}

export class VertexTextToSpeechNode extends TextToSpeechGeminiNode {
  static readonly nodeType = "vertex.audio.TextToSpeech";
  static readonly geminiProvider = VERTEX;
  static readonly requiredSettings = VERTEX_SETTINGS;
  static readonly description = `Generate speech from text with Gemini text-to-speech models on Vertex AI, billed to your Google Cloud project.\n    ${VERTEX_TAGS}, text-to-speech, tts, audio, voice`;

  @vertexModel("tts_model", "gemini-3.8-flash-tts", "The text-to-speech model.")
  declare model: GeminiModelValue;
}

export class VertexTranscribeNode extends TranscribeGeminiNode {
  static readonly nodeType = "vertex.audio.Transcribe";
  static readonly geminiProvider = VERTEX;
  static readonly requiredSettings = VERTEX_SETTINGS;
  static readonly description = `Transcribe audio to text with Gemini on Vertex AI, billed to your Google Cloud project.\n    ${VERTEX_TAGS}, transcription, speech-to-text, audio`;

  @vertexModel("asr_model", "gemini-3.5-flash", "The Gemini model that transcribes.")
  declare model: GeminiModelValue;
}

// ── Exports ─────────────────────────────────────────────────────────────────

export const GEMINI_NODES = tagAsServer([
  GroundedSearchNode,
  EmbeddingNode,
  ImageGenerationNode,
  TextToVideoGeminiNode,
  ImageToVideoGeminiNode,
  TextToSpeechGeminiNode,
  TranscribeGeminiNode,
  VertexGroundedSearchNode,
  VertexEmbeddingNode,
  VertexImageGenerationNode,
  VertexTextToVideoNode,
  VertexImageToVideoNode,
  VertexTextToSpeechNode,
  VertexTranscribeNode
]);
