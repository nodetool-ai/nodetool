import { BaseNode, prop } from "@nodetool/node-sdk";
import type {
  NodeClass,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey(secrets: Record<string, string>): string {
  const key = secrets.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  return key;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

// ---------------------------------------------------------------------------
// 1. Embedding
// ---------------------------------------------------------------------------
export class EmbeddingNode extends BaseNode {
  static readonly nodeType = "openai.text.Embedding";
  static readonly title = "Embedding";
  static readonly description =
    "Generate vector representations of text for semantic analysis.\n    embeddings, similarity, search, clustering, classification\n\n    Uses OpenAI's embedding models to create dense vector representations of text.\n    These vectors capture semantic meaning, enabling:\n    - Semantic search\n    - Text clustering\n    - Document classification\n    - Recommendation systems\n    - Anomaly detection\n    - Measuring text similarity and diversity";
  static readonly metadataOutputTypes = {
    output: "list"
  };
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({ type: "str", default: "", title: "Input" })
  declare input: any;

  @prop({
    type: "enum",
    default: "text-embedding-3-small",
    title: "Model",
    values: ["text-embedding-3-large", "text-embedding-3-small"]
  })
  declare model: any;

  @prop({ type: "int", default: 4096, title: "Chunk Size" })
  declare chunk_size: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const text = String(this.input ?? "");
    const model = String(this.model ?? "text-embedding-3-small");
    const chunkSize = Number(this.chunk_size ?? 4096);

    // Chunk input text
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    if (chunks.length === 0) chunks.push("");

    const res = await fetch(`${OPENAI_API_BASE}/embeddings`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ input: chunks, model })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Embedding API error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as {
      data: Array<{ embedding: number[] }>;
    };

    // Average embeddings across chunks
    const allEmbeddings = data.data.map((d) => d.embedding);
    const dim = allEmbeddings[0]?.length ?? 0;
    const avg = new Array(dim).fill(0);
    for (const emb of allEmbeddings) {
      for (let i = 0; i < dim; i++) {
        avg[i] += emb[i] / allEmbeddings.length;
      }
    }

    return { output: avg };
  }
}

// ---------------------------------------------------------------------------
// 2. WebSearch
// ---------------------------------------------------------------------------
export class WebSearchNode extends BaseNode {
  static readonly nodeType = "openai.text.WebSearch";
  static readonly title = "Web Search";
  static readonly description =
    "🔍 OpenAI Web Search - Searches the web using OpenAI's web search capabilities.\n\n    This node uses an OpenAI model equipped with web search functionality\n    (like gpt-4o with search preview) to answer queries based on current web information.\n    Requires an OpenAI API key.";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly requiredSettings = ["OPENAI_API_KEY"];

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "The search query to execute."
  })
  declare query: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const query = String(this.query ?? "");
    if (!query) throw new Error("Search query cannot be empty");

    const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: "gpt-4o-search-preview",
        web_search_options: {},
        messages: [{ role: "user", content: query }]
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI WebSearch API error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as Record<string, unknown>;

    let content: string;
    if (data.choices && Array.isArray(data.choices)) {
      const first = data.choices[0] as Record<string, unknown> | undefined;
      const msg = first?.message as Record<string, unknown> | undefined;
      content = String(msg?.content ?? JSON.stringify(data));
    } else {
      content = JSON.stringify(data);
    }

    return { output: content };
  }
}

// ---------------------------------------------------------------------------
// 3. Moderation
// ---------------------------------------------------------------------------
export class ModerationNode extends BaseNode {
  static readonly nodeType = "openai.text.Moderation";
  static readonly title = "Moderation";
  static readonly description =
    "Check text content for potential policy violations using OpenAI's moderation API.\n    moderation, safety, content, filter, policy, harmful, toxic\n\n    Uses OpenAI's moderation models to detect potentially harmful content including:\n    - Hate speech\n    - Harassment\n    - Self-harm content\n    - Sexual content\n    - Violence\n    - Graphic violence\n\n    Returns flagged status and category scores for comprehensive content analysis.";
  static readonly metadataOutputTypes = {
    flagged: "bool",
    categories: "dict[str, bool]",
    category_scores: "dict[str, float]"
  };
  static readonly basicFields = ["input"];
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Input",
    description: "The text content to check for policy violations."
  })
  declare input: any;

  @prop({
    type: "enum",
    default: "omni-moderation-latest",
    title: "Model",
    description: "The moderation model to use.",
    values: [
      "omni-moderation-latest",
      "omni-moderation-2024-09-26",
      "text-moderation-latest",
      "text-moderation-stable"
    ]
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const text = String(this.input ?? "");
    const model = String(this.model ?? "omni-moderation-latest");
    if (!text) throw new Error("Input text cannot be empty");

    const res = await fetch(`${OPENAI_API_BASE}/moderations`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ input: text, model })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Moderation API error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as Record<string, unknown>;

    const results = data.results as Array<Record<string, unknown>> | undefined;
    if (results && results.length > 0) {
      const result = results[0];
      return {
        flagged: result.flagged ?? false,
        categories: result.categories ?? {},
        category_scores: result.category_scores ?? {}
      };
    }

    return { flagged: false, categories: {}, category_scores: {} };
  }
}

// ---------------------------------------------------------------------------
// 4. CreateImage
// ---------------------------------------------------------------------------
export class CreateImageNode extends BaseNode {
  static readonly nodeType = "openai.image.CreateImage";
  static readonly title = "Create Image";
  static readonly description =
    "Generates images from textual descriptions.\n    image, t2i, tti, text-to-image, create, generate, picture, photo, art, drawing, illustration";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly exposeAsTool = true;
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The prompt to use."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "gpt-image-1",
    title: "Model",
    description: "The model to use for image generation.",
    values: ["gpt-image-1"]
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    title: "Size",
    description: "The size of the image to generate.",
    values: ["1024x1024", "1536x1024", "1024x1536"]
  })
  declare size: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Background",
    description: "The background of the image to generate.",
    values: ["transparent", "opaque", "auto"]
  })
  declare background: any;

  @prop({
    type: "enum",
    default: "high",
    title: "Quality",
    description: "The quality of the image to generate.",
    values: ["high", "medium", "low"]
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const model = String(this.model ?? "gpt-image-1");
    const size = String(this.size ?? "1024x1024");
    const quality = String(this.quality ?? "high");
    const background = String(this.background ?? "auto");

    const res = await fetch(`${OPENAI_API_BASE}/images/generations`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        prompt,
        model,
        n: 1,
        size,
        quality,
        background,
        response_format: "b64_json"
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI CreateImage API error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as {
      data: Array<{ b64_json?: string; url?: string }>;
    };

    const item = data.data[0];
    if (item.b64_json) {
      return { output: { type: "image", data: `data:image/png;base64,${item.b64_json}` } };
    } else if (item.url) {
      return { output: { type: "image", uri: item.url } };
    }
    throw new Error("No image data in response");
  }
}

// ---------------------------------------------------------------------------
// 5. EditImage
// ---------------------------------------------------------------------------
export class EditImageNode extends BaseNode {
  static readonly nodeType = "openai.image.EditImage";
  static readonly title = "Edit Image";
  static readonly description =
    "Edit images using OpenAI's gpt-image-1 model.\n    image, edit, modify, transform, inpaint, outpaint, variation\n\n    Takes an input image and a text prompt to generate a modified version.\n    Can be used for inpainting, outpainting, style transfer, and image modification.\n    Optionally accepts a mask to specify which areas to edit.";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly exposeAsTool = true;
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
    description: "The image to edit."
  })
  declare image: any;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Mask",
    description:
      "Optional mask image. White areas will be edited, black areas preserved."
  })
  declare mask: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The prompt describing the desired edit."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "gpt-image-1",
    title: "Model",
    description: "The model to use for image editing.",
    values: ["gpt-image-1"]
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "1024x1024",
    title: "Size",
    description: "The size of the output image.",
    values: ["1024x1024", "1536x1024", "1024x1536"]
  })
  declare size: any;

  @prop({
    type: "enum",
    default: "high",
    title: "Quality",
    description: "The quality of the generated image.",
    values: ["high", "medium", "low"]
  })
  declare quality: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Edit prompt cannot be empty");

    const image = this.image as Record<string, unknown> | undefined;
    if (!image || (!image.data && !image.uri)) {
      throw new Error("Input image is required");
    }

    const model = String(this.model ?? "gpt-image-1");
    const size = String(this.size ?? "1024x1024");
    const quality = String(this.quality ?? "high");

    // Build multipart form data
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("model", model);
    formData.append("size", size);
    formData.append("quality", quality);
    formData.append("response_format", "b64_json");

    // Convert image ref to blob
    const imageBlob = await refToBlob(image);
    formData.append("image", imageBlob, "image.png");

    // Optional mask
    const mask = this.mask as Record<string, unknown> | undefined;
    if (mask && (mask.data || mask.uri)) {
      const maskBlob = await refToBlob(mask);
      formData.append("mask", maskBlob, "mask.png");
    }

    const res = await fetch(`${OPENAI_API_BASE}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI EditImage API error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as {
      data: Array<{ b64_json?: string; url?: string }>;
    };

    const item = data.data[0];
    if (item.b64_json) {
      return { output: { type: "image", data: `data:image/png;base64,${item.b64_json}` } };
    } else if (item.url) {
      return { output: { type: "image", uri: item.url } };
    }
    throw new Error("No image data in response");
  }
}

/** Convert an image/audio ref object to a Blob for multipart upload. */
async function refToBlob(ref: Record<string, unknown>): Promise<Blob> {
  if (ref.data && typeof ref.data === "string") {
    const dataStr = ref.data as string;
    // Handle data: URI
    if (dataStr.startsWith("data:")) {
      const commaIdx = dataStr.indexOf(",");
      const b64 = dataStr.slice(commaIdx + 1);
      const buf = Buffer.from(b64, "base64");
      return new Blob([buf]);
    }
    // Assume raw base64
    const buf = Buffer.from(dataStr, "base64");
    return new Blob([buf]);
  }
  if (ref.uri && typeof ref.uri === "string") {
    const r = await fetch(ref.uri as string);
    return await r.blob();
  }
  throw new Error("Cannot convert ref to blob: no data or uri");
}

// ---------------------------------------------------------------------------
// 6. TextToSpeech
// ---------------------------------------------------------------------------
export class TextToSpeechNode extends BaseNode {
  static readonly nodeType = "openai.audio.TextToSpeech";
  static readonly title = "Text To Speech";
  static readonly description =
    "Converts text to speech using OpenAI TTS models.\n    audio, tts, text-to-speech, voice, synthesis";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly basicFields = ["input", "model", "voice"];
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly autoSaveAsset = true;
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "tts-1",
    title: "Model",
    values: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"]
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "alloy",
    title: "Voice",
    values: [
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "fable",
      "onyx",
      "nova",
      "sage",
      "shimmer",
      "verse"
    ]
  })
  declare voice: any;

  @prop({ type: "str", default: "", title: "Input" })
  declare input: any;

  @prop({ type: "float", default: 1, title: "Speed", min: 0.25, max: 4 })
  declare speed: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const text = String(this.input ?? "");
    const model = String(this.model ?? "tts-1");
    const voice = String(this.voice ?? "alloy");
    const speed = Number(this.speed ?? 1.0);

    const res = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model,
        input: text,
        voice,
        speed,
        response_format: "mp3"
      })
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI TTS API error ${res.status}: ${err}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const b64 = Buffer.from(arrayBuf).toString("base64");
    return { output: { type: "audio", data: `data:audio/mp3;base64,${b64}` } };
  }
}

// ---------------------------------------------------------------------------
// 7. Translate
// ---------------------------------------------------------------------------
export class TranslateNode extends BaseNode {
  static readonly nodeType = "openai.audio.Translate";
  static readonly title = "Translate";
  static readonly description =
    "Translates speech in audio to English text.\n    audio, translation, speech-to-text, localization";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly exposeAsTool = true;

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
    description: "The audio file to translate."
  })
  declare audio: any;

  @prop({
    type: "float",
    default: 0,
    title: "Temperature",
    description: "The temperature to use for the translation."
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const audio = this.audio as Record<string, unknown> | undefined;
    if (!audio || (!audio.data && !audio.uri)) {
      throw new Error("Audio input is required");
    }
    const temperature = Number(this.temperature ?? 0.0);

    const audioBlob = await refToBlob(audio);
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("temperature", String(temperature));

    const res = await fetch(`${OPENAI_API_BASE}/audio/translations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Translate API error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { text: string };
    return { output: data.text };
  }
}

// ---------------------------------------------------------------------------
// 8. Transcribe
// ---------------------------------------------------------------------------
export class TranscribeNode extends BaseNode {
  static readonly nodeType = "openai.audio.Transcribe";
  static readonly title = "Transcribe";
  static readonly description =
    "Converts speech to text using OpenAI's speech-to-text API.\n    audio, transcription, speech-to-text, stt, whisper";
  static readonly metadataOutputTypes = {
    text: "str",
    words: "list[audio_chunk]",
    segments: "list[audio_chunk]"
  };
  static readonly basicFields = ["audio", "language", "timestamps"];
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "enum",
    default: "whisper-1",
    title: "Model",
    description: "The model to use for transcription.",
    values: ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"]
  })
  declare model: any;

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
    description: "The audio file to transcribe (max 25 MB)."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "auto_detect",
    title: "Language",
    description: "The language of the input audio",
    values: [
      "auto_detect",
      "af",
      "ar",
      "hy",
      "az",
      "be",
      "bn",
      "bs",
      "bg",
      "ca",
      "hr",
      "cs",
      "da",
      "nl",
      "en",
      "et",
      "tl",
      "fi",
      "fr",
      "gl",
      "de",
      "el",
      "gu",
      "he",
      "hi",
      "hu",
      "is",
      "id",
      "it",
      "ja",
      "kn",
      "kk",
      "ko",
      "lv",
      "lt",
      "mk",
      "ms",
      "zh",
      "mi",
      "mr",
      "ne",
      "no",
      "fa",
      "pl",
      "pt",
      "pa",
      "ro",
      "ru",
      "sr",
      "sk",
      "sl",
      "es",
      "sw",
      "sv",
      "ta",
      "te",
      "th",
      "tr",
      "uk",
      "ur",
      "vi",
      "cy"
    ]
  })
  declare language: any;

  @prop({
    type: "bool",
    default: false,
    title: "Timestamps",
    description: "Whether to return timestamps for the generated text."
  })
  declare timestamps: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "Optional text to guide the model's style or continue a previous audio segment."
  })
  declare prompt: any;

  @prop({
    type: "float",
    default: 0,
    title: "Temperature",
    description:
      "The sampling temperature between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.",
    min: 0,
    max: 1
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(this._secrets);
    const audio = this.audio as Record<string, unknown> | undefined;
    if (!audio || (!audio.data && !audio.uri)) {
      throw new Error("Audio input is required");
    }

    const model = String(this.model ?? "whisper-1");
    const language = String(this.language ?? "auto_detect");
    const timestamps = Boolean(this.timestamps ?? false);
    const promptText = String(this.prompt ?? "");
    const temperature = Number(this.temperature ?? 0);

    const isNewModel =
      model === "gpt-4o-transcribe" || model === "gpt-4o-mini-transcribe";

    const audioBlob = await refToBlob(audio);
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", model);
    formData.append("temperature", String(temperature));

    if (timestamps) {
      if (isNewModel) {
        throw new Error(
          "New transcription models do not support verbose_json timestamps"
        );
      }
      formData.append("response_format", "verbose_json");
      formData.append("timestamp_granularities[]", "segment");
      formData.append("timestamp_granularities[]", "word");
    } else {
      formData.append("response_format", "json");
    }

    if (language !== "auto_detect") {
      formData.append("language", language);
    }
    if (promptText) {
      formData.append("prompt", promptText);
    }

    const res = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Transcribe API error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as Record<string, unknown>;

    const text = String(data.text ?? "");
    const words: Array<{ timestamp: [number, number]; text: string }> = [];
    const segments: Array<{ timestamp: [number, number]; text: string }> = [];

    if (timestamps && !isNewModel) {
      const rawSegments = data.segments as
        | Array<Record<string, unknown>>
        | undefined;
      if (rawSegments) {
        for (const seg of rawSegments) {
          segments.push({
            timestamp: [Number(seg.start), Number(seg.end)],
            text: String(seg.text)
          });
        }
      }
      const rawWords = data.words as Array<Record<string, unknown>> | undefined;
      if (rawWords) {
        for (const w of rawWords) {
          words.push({
            timestamp: [Number(w.start), Number(w.end)],
            text: String(w.word)
          });
        }
      }
    }

    return { text, words, segments };
  }
}

// ---------------------------------------------------------------------------
// 9. RealtimeAgent
// ---------------------------------------------------------------------------
export class RealtimeAgentNode extends BaseNode {
  static readonly nodeType = "openai.agents.RealtimeAgent";
  static readonly title = "Realtime Agent";
  static readonly description =
    "Realtime conversational agent using OpenAI’s WebSocket Realtime API.\n" +
    "Streams audio/text input and receives streaming text and audio responses with <300ms latency.\n" +
    "realtime, streaming, openai, audio-input, text-output, websocket\n\n" +
    "Uses a persistent WebSocket connection with server-side VAD for automatic turn detection.";
  static readonly metadataOutputTypes = {
    chunk: "chunk",
    audio: "audio",
    text: "str"
  };
  static readonly basicFields = ["model", "system", "chunk", "speed"];
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly supportsDynamicOutputs = true;
  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;

  @prop({
    type: "enum",
    default: "gpt-4o-mini-realtime-preview",
    title: "Model",
    values: ["gpt-4o-realtime-preview", "gpt-4o-mini-realtime-preview"]
  })
  declare model: any;

  @prop({
    type: "str",
    default:
      "You are an AI assistant interacting in real-time. " +
      "Be concise but clear. Prioritize key information first. " +
      "Ask clarifying questions when needed.",
    title: "System",
    description: "System instructions for the realtime session"
  })
  declare system: any;

  @prop({
    type: "chunk",
    default: {
      type: "chunk",
      node_id: null,
      thread_id: null,
      workflow_id: null,
      content_type: "text",
      content: "",
      content_metadata: {},
      done: false,
      thinking: false
    },
    title: "Chunk",
    description: "The audio chunk to use as input."
  })
  declare chunk: any;

  @prop({
    type: "enum",
    default: "alloy",
    title: "Voice",
    description: "The voice for the audio output",
    values: [
      "none",
      "ash",
      "alloy",
      "ballad",
      "coral",
      "echo",
      "fable",
      "onyx",
      "nova",
      "shimmer",
      "sage",
      "verse"
    ]
  })
  declare voice: any;

  @prop({
    type: "float",
    default: 1,
    title: "Speed",
    description: "The speed of the model’s spoken response",
    min: 0.25,
    max: 1.5
  })
  declare speed: any;

  @prop({
    type: "float",
    default: 0.8,
    title: "Temperature",
    description: "The temperature for the response",
    min: 0.6,
    max: 1.2
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    let apiKey = "";
    if (context && typeof context.getSecret === "function") {
      apiKey = (await context.getSecret("OPENAI_API_KEY")) ?? "";
    }
    if (!apiKey) apiKey = process.env.OPENAI_API_KEY ?? "";
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    const model = String(this.model ?? "gpt-4o-mini-realtime-preview");
    const voice = String(this.voice ?? "alloy");
    const system = String(this.system ?? "");
    const temperature = Number(this.temperature ?? 0.8);
    const speed = Number(this.speed ?? 1);
    const wantAudio = voice !== "none";

    const { WebSocket } = await import("ws");
    const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    // Configure session
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: wantAudio ? ["text", "audio"] : ["text"],
          instructions: system || undefined,
          voice: wantAudio ? voice : undefined,
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            silence_duration_ms: 200
          },
          temperature,
          speed
        }
      })
    );

    // Consumer: listen for response events
    let fullText = "";
    let consumerDone = false;
    let resolveResponseDone!: () => void;
    const responseDonePromise = new Promise<void>((resolve) => {
      resolveResponseDone = resolve;
    });

    const consumerPromise = new Promise<void>((resolve, reject) => {
      ws.on("message", async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          const msgType = String(msg.type ?? "");

          if (msgType === "response.text.delta") {
            const delta = String(msg.delta ?? "");
            if (delta) {
              fullText += delta;
              await outputs.emit("chunk", {
                type: "chunk",
                content: delta,
                done: false,
                content_type: "text"
              });
            }
          } else if (msgType === "response.audio.delta") {
            const audioB64 = String(msg.delta ?? "");
            if (audioB64) {
              await outputs.emit("chunk", {
                type: "chunk",
                content: audioB64,
                done: false,
                content_type: "audio",
                content_metadata: {
                  format: "pcm16",
                  encoding: "pcm16",
                  sample_rate: 24000,
                  channels: 1
                }
              });
            }
          } else if (msgType === "response.audio_transcript.delta") {
            const delta = String(msg.delta ?? "");
            if (delta) fullText += delta;
          } else if (msgType === "response.done") {
            resolveResponseDone();
          } else if (msgType === "error") {
            const errMsg =
              (msg.error as Record<string, unknown> | undefined)?.message ??
              "Unknown realtime error";
            reject(new Error(`OpenAI Realtime error: ${errMsg}`));
          }
        } catch (err) {
          if (!consumerDone) reject(err);
        }
      });

      ws.on("error", (err: Error) => {
        if (!consumerDone) reject(err);
      });

      ws.on("close", () => {
        consumerDone = true;
        resolve();
      });
    });

    // Producer: read streaming input and forward to WebSocket
    try {
      for await (const [handle, item] of inputs.any()) {
        if (handle === "__control__") continue;

        const chunk = item as Record<string, unknown> | string;
        let done = false;

        if (typeof chunk === "string") {
          // Raw base64 audio
          if (chunk && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: chunk
              })
            );
          }
          continue;
        }

        done = Boolean(chunk.done ?? false);
        if (done) break;

        const contentType = String(chunk.content_type ?? "text");
        const content = String(chunk.content ?? "");
        if (!content) continue;

        if (contentType === "audio") {
          // Audio chunk → append to audio buffer
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: content
              })
            );
          }
        } else {
          // Text chunk → create conversation item and trigger response
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "message",
                  role: "user",
                  content: [{ type: "input_text", text: content }]
                }
              })
            );
            ws.send(JSON.stringify({ type: "response.create" }));
          }
        }
      }

      // Commit any remaining audio buffer
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      }

      // Wait for response.done with timeout
      await Promise.race([
        responseDonePromise,
        consumerPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 10000))
      ]);
    } finally {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      consumerDone = true;
    }

    await consumerPromise;

    // Emit final done chunks
    await outputs.emit("chunk", {
      type: "chunk",
      content: "",
      done: true,
      content_type: "text"
    });
    await outputs.emit("text", fullText);
  }
}

// ---------------------------------------------------------------------------
// 10. RealtimeTranscription
// ---------------------------------------------------------------------------
export class RealtimeTranscriptionNode extends BaseNode {
  static readonly nodeType = "openai.agents.RealtimeTranscription";
  static readonly title = "Realtime Transcription";
  static readonly description =
    "Realtime speech-to-text using OpenAI's WebSocket Realtime API.\n" +
    "Streams audio chunks in and receives transcription results in real-time.\n" +
    "audio, transcription, stt, streaming, realtime, websocket, openai\n\n" +
    "Uses server-side VAD for automatic speech segment detection.";
  static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk"
  };
  static readonly requiredSettings = ["OPENAI_API_KEY"];
  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;

  @prop({
    type: "enum",
    default: "gpt-4o-mini-realtime-preview",
    title: "Model",
    description: "The realtime model to use.",
    values: ["gpt-4o-realtime-preview", "gpt-4o-mini-realtime-preview"]
  })
  declare model: any;

  @prop({
    type: "chunk",
    default: {
      type: "chunk",
      node_id: null,
      thread_id: null,
      workflow_id: null,
      content_type: "audio",
      content: "",
      content_metadata: {},
      done: false,
      thinking: false
    },
    title: "Chunk",
    description: "Audio chunk input stream (base64-encoded PCM16 audio)."
  })
  declare chunk: any;

  @prop({
    type: "str",
    default: "",
    title: "System",
    description: "System instructions (optional)"
  })
  declare system: any;

  @prop({
    type: "float",
    default: 0.8,
    title: "Temperature",
    description: "Decoding temperature"
  })
  declare temperature: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    let apiKey = "";
    if (context && typeof context.getSecret === "function") {
      apiKey = (await context.getSecret("OPENAI_API_KEY")) ?? "";
    }
    if (!apiKey) apiKey = process.env.OPENAI_API_KEY ?? "";
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

    const model = String(this.model ?? "gpt-4o-mini-realtime-preview");
    const temperature = Number(this.temperature ?? 0.8);

    const { WebSocket } = await import("ws");
    const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    // Configure session for transcription only (no audio output)
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          modalities: ["text"],
          instructions: this.system ? String(this.system) : undefined,
          input_audio_format: "pcm16",
          input_audio_transcription: { model: "gpt-4o-mini-transcribe" },
          turn_detection: {
            type: "server_vad",
            silence_duration_ms: 500
          },
          temperature
        }
      })
    );

    // Consumer: listen for transcription events
    let fullText = "";
    let consumerDone = false;
    let resolveLastTranscript!: () => void;
    const lastTranscriptPromise = new Promise<void>((resolve) => {
      resolveLastTranscript = resolve;
    });
    let finalizeRequested = false;

    const consumerPromise = new Promise<void>((resolve, reject) => {
      ws.on("message", async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          const msgType = String(msg.type ?? "");

          if (
            msgType ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const text = String(msg.transcript ?? "");
            if (text) {
              fullText += (fullText ? " " : "") + text;
              await outputs.emit("chunk", {
                type: "chunk",
                content: text,
                done: false,
                content_type: "text"
              });
              if (finalizeRequested) {
                resolveLastTranscript();
              }
            }
          } else if (msgType === "response.done") {
            if (finalizeRequested) {
              resolveLastTranscript();
            }
          } else if (msgType === "error") {
            const errMsg =
              (msg.error as Record<string, unknown> | undefined)?.message ??
              "Unknown realtime error";
            reject(new Error(`OpenAI Realtime error: ${errMsg}`));
          }
        } catch (err) {
          if (!consumerDone) reject(err);
        }
      });

      ws.on("error", (err: Error) => {
        if (!consumerDone) reject(err);
      });

      ws.on("close", () => {
        consumerDone = true;
        resolve();
      });
    });

    // Producer: read streaming audio input and forward to WebSocket
    try {
      for await (const [handle, item] of inputs.any()) {
        if (handle === "__control__") continue;

        const chunk = item as Record<string, unknown> | string;
        let audioB64: string;
        let done = false;

        if (typeof chunk === "string") {
          audioB64 = chunk;
        } else {
          if (chunk.content_type && chunk.content_type !== "audio") continue;
          audioB64 = String(chunk.content ?? "");
          done = Boolean(chunk.done ?? false);
        }

        if (done) break;
        if (!audioB64) continue;

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: audioB64
            })
          );
        }
      }

      // Commit remaining audio
      finalizeRequested = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      }

      // Wait for final transcript
      await Promise.race([
        lastTranscriptPromise,
        consumerPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 5000))
      ]);
    } finally {
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      consumerDone = true;
    }

    await consumerPromise;

    // Emit final done chunk and full text
    await outputs.emit("chunk", {
      type: "chunk",
      content: "",
      done: true,
      content_type: "text"
    });
    await outputs.emit("text", fullText);
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const OPENAI_NODES: readonly NodeClass[] = [
  EmbeddingNode,
  WebSearchNode,
  ModerationNode,
  CreateImageNode,
  EditImageNode,
  TextToSpeechNode,
  TranslateNode,
  TranscribeNode,
  RealtimeAgentNode,
  RealtimeTranscriptionNode
];
