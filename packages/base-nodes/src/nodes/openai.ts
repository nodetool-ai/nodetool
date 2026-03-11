import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

const OPENAI_API_BASE = "https://api.openai.com/v1";

function getApiKey(inputs: Record<string, unknown>): string {
  const key =
    (inputs._secrets as Record<string, string>)?.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "";
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  return key;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// 1. Embedding
// ---------------------------------------------------------------------------
export class EmbeddingNode extends BaseNode {
  static readonly nodeType = "openai.text.Embedding";
            static readonly title = "Embedding";
            static readonly description = "Generate vector representations of text for semantic analysis.\n    embeddings, similarity, search, clustering, classification\n\n    Uses OpenAI's embedding models to create dense vector representations of text.\n    These vectors capture semantic meaning, enabling:\n    - Semantic search\n    - Text clustering\n    - Document classification\n    - Recommendation systems\n    - Anomaly detection\n    - Measuring text similarity and diversity";
        static readonly metadataOutputTypes = {
    output: "np_array"
  };
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Input" })
  declare input: any;

  @prop({ type: "enum", default: "text-embedding-3-small", title: "Model", values: [
  "text-embedding-3-large",
  "text-embedding-3-small"
] })
  declare model: any;

  @prop({ type: "int", default: 4096, title: "Chunk Size" })
  declare chunk_size: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const text = String(inputs.input ?? "");
    const model = String(inputs.model ?? "text-embedding-3-small");
    const chunkSize = Number(inputs.chunk_size ?? 4096);

    // Chunk input text
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    if (chunks.length === 0) chunks.push("");

    const res = await fetch(`${OPENAI_API_BASE}/embeddings`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ input: chunks, model }),
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
            static readonly description = "🔍 OpenAI Web Search - Searches the web using OpenAI's web search capabilities.\n\n    This node uses an OpenAI model equipped with web search functionality\n    (like gpt-4o with search preview) to answer queries based on current web information.\n    Requires an OpenAI API key.";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
  
  @prop({ type: "str", default: "", title: "Query", description: "The search query to execute." })
  declare query: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const query = String(inputs.query ?? "");
    if (!query) throw new Error("Search query cannot be empty");

    const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: "gpt-4o-search-preview",
        web_search_options: {},
        messages: [{ role: "user", content: query }],
      }),
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
            static readonly description = "Check text content for potential policy violations using OpenAI's moderation API.\n    moderation, safety, content, filter, policy, harmful, toxic\n\n    Uses OpenAI's moderation models to detect potentially harmful content including:\n    - Hate speech\n    - Harassment\n    - Self-harm content\n    - Sexual content\n    - Violence\n    - Graphic violence\n\n    Returns flagged status and category scores for comprehensive content analysis.";
        static readonly metadataOutputTypes = {
    flagged: "bool",
    categories: "dict[str, bool]",
    category_scores: "dict[str, float]"
  };
          static readonly basicFields = [
  "input"
];
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Input", description: "The text content to check for policy violations." })
  declare input: any;

  @prop({ type: "enum", default: "omni-moderation-latest", title: "Model", description: "The moderation model to use.", values: [
  "omni-moderation-latest",
  "omni-moderation-2024-09-26",
  "text-moderation-latest",
  "text-moderation-stable"
] })
  declare model: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const text = String(inputs.input ?? "");
    const model = String(inputs.model ?? "omni-moderation-latest");
    if (!text) throw new Error("Input text cannot be empty");

    const res = await fetch(`${OPENAI_API_BASE}/moderations`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ input: text, model }),
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
        category_scores: result.category_scores ?? {},
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
            static readonly description = "Generates images from textual descriptions.\n    image, t2i, tti, text-to-image, create, generate, picture, photo, art, drawing, illustration";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "str", default: "", title: "Prompt", description: "The prompt to use." })
  declare prompt: any;

  @prop({ type: "enum", default: "gpt-image-1", title: "Model", description: "The model to use for image generation.", values: [
  "gpt-image-1"
] })
  declare model: any;

  @prop({ type: "enum", default: "1024x1024", title: "Size", description: "The size of the image to generate.", values: [
  "1024x1024",
  "1536x1024",
  "1024x1536"
] })
  declare size: any;

  @prop({ type: "enum", default: "auto", title: "Background", description: "The background of the image to generate.", values: [
  "transparent",
  "opaque",
  "auto"
] })
  declare background: any;

  @prop({ type: "enum", default: "high", title: "Quality", description: "The quality of the image to generate.", values: [
  "high",
  "medium",
  "low"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Prompt cannot be empty");

    const model = String(inputs.model ?? "gpt-image-1");
    const size = String(inputs.size ?? "1024x1024");
    const quality = String(inputs.quality ?? "high");
    const background = String(inputs.background ?? "auto");

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
        response_format: "b64_json",
      }),
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
      return { output: { data: `data:image/png;base64,${item.b64_json}` } };
    } else if (item.url) {
      return { output: { uri: item.url } };
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
            static readonly description = "Edit images using OpenAI's gpt-image-1 model.\n    image, edit, modify, transform, inpaint, outpaint, variation\n\n    Takes an input image and a text prompt to generate a modified version.\n    Can be used for inpainting, outpainting, style transfer, and image modification.\n    Optionally accepts a mask to specify which areas to edit.";
        static readonly metadataOutputTypes = {
    output: "image"
  };
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "The image to edit." })
  declare image: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Mask", description: "Optional mask image. White areas will be edited, black areas preserved." })
  declare mask: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "The prompt describing the desired edit." })
  declare prompt: any;

  @prop({ type: "enum", default: "gpt-image-1", title: "Model", description: "The model to use for image editing.", values: [
  "gpt-image-1"
] })
  declare model: any;

  @prop({ type: "enum", default: "1024x1024", title: "Size", description: "The size of the output image.", values: [
  "1024x1024",
  "1536x1024",
  "1024x1536"
] })
  declare size: any;

  @prop({ type: "enum", default: "high", title: "Quality", description: "The quality of the generated image.", values: [
  "high",
  "medium",
  "low"
] })
  declare quality: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const prompt = String(inputs.prompt ?? "");
    if (!prompt) throw new Error("Edit prompt cannot be empty");

    const image = inputs.image as Record<string, unknown> | undefined;
    if (!image || (!image.data && !image.uri)) {
      throw new Error("Input image is required");
    }

    const model = String(inputs.model ?? "gpt-image-1");
    const size = String(inputs.size ?? "1024x1024");
    const quality = String(inputs.quality ?? "high");

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
    const mask = inputs.mask as Record<string, unknown> | undefined;
    if (mask && (mask.data || mask.uri)) {
      const maskBlob = await refToBlob(mask);
      formData.append("mask", maskBlob, "mask.png");
    }

    const res = await fetch(`${OPENAI_API_BASE}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
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
      return { output: { data: `data:image/png;base64,${item.b64_json}` } };
    } else if (item.url) {
      return { output: { uri: item.url } };
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
            static readonly description = "Converts text to speech using OpenAI TTS models.\n    audio, tts, text-to-speech, voice, synthesis";
        static readonly metadataOutputTypes = {
    output: "audio"
  };
          static readonly basicFields = [
  "input",
  "model",
  "voice"
];
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "enum", default: "tts-1", title: "Model", values: [
  "tts-1",
  "tts-1-hd",
  "gpt-4o-mini-tts"
] })
  declare model: any;

  @prop({ type: "enum", default: "alloy", title: "Voice", values: [
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
] })
  declare voice: any;

  @prop({ type: "str", default: "", title: "Input" })
  declare input: any;

  @prop({ type: "float", default: 1, title: "Speed", min: 0.25, max: 4 })
  declare speed: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const text = String(inputs.input ?? "");
    const model = String(inputs.model ?? "tts-1");
    const voice = String(inputs.voice ?? "alloy");
    const speed = Number(inputs.speed ?? 1.0);

    const res = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({ model, input: text, voice, speed, response_format: "mp3" }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI TTS API error ${res.status}: ${err}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const b64 = Buffer.from(arrayBuf).toString("base64");
    return { output: { data: `data:audio/mp3;base64,${b64}` } };
  }
}

// ---------------------------------------------------------------------------
// 7. Translate
// ---------------------------------------------------------------------------
export class TranslateNode extends BaseNode {
  static readonly nodeType = "openai.audio.Translate";
            static readonly title = "Translate";
            static readonly description = "Translates speech in audio to English text.\n    audio, translation, speech-to-text, localization";
        static readonly metadataOutputTypes = {
    output: "str"
  };
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to translate." })
  declare audio: any;

  @prop({ type: "float", default: 0, title: "Temperature", description: "The temperature to use for the translation." })
  declare temperature: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const audio = inputs.audio as Record<string, unknown> | undefined;
    if (!audio || (!audio.data && !audio.uri)) {
      throw new Error("Audio input is required");
    }
    const temperature = Number(inputs.temperature ?? 0.0);

    const audioBlob = await refToBlob(audio);
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("temperature", String(temperature));

    const res = await fetch(`${OPENAI_API_BASE}/audio/translations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
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
            static readonly description = "Converts speech to text using OpenAI's speech-to-text API.\n    audio, transcription, speech-to-text, stt, whisper";
        static readonly metadataOutputTypes = {
    text: "str",
    words: "list[audio_chunk]",
    segments: "list[audio_chunk]"
  };
          static readonly basicFields = [
  "audio",
  "language",
  "timestamps"
];
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "enum", default: "whisper-1", title: "Model", description: "The model to use for transcription.", values: [
  "whisper-1",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe"
] })
  declare model: any;

  @prop({ type: "audio", default: {
  "type": "audio",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Audio", description: "The audio file to transcribe (max 25 MB)." })
  declare audio: any;

  @prop({ type: "enum", default: "auto_detect", title: "Language", description: "The language of the input audio", values: [
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
] })
  declare language: any;

  @prop({ type: "bool", default: false, title: "Timestamps", description: "Whether to return timestamps for the generated text." })
  declare timestamps: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Optional text to guide the model's style or continue a previous audio segment." })
  declare prompt: any;

  @prop({ type: "float", default: 0, title: "Temperature", description: "The sampling temperature between 0 and 1. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic.", min: 0, max: 1 })
  declare temperature: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const audio = inputs.audio as Record<string, unknown> | undefined;
    if (!audio || (!audio.data && !audio.uri)) {
      throw new Error("Audio input is required");
    }

    const model = String(inputs.model ?? "whisper-1");
    const language = String(inputs.language ?? "auto_detect");
    const timestamps = Boolean(inputs.timestamps ?? false);
    const promptText = String(inputs.prompt ?? "");
    const temperature = Number(inputs.temperature ?? 0);

    const isNewModel = model === "gpt-4o-transcribe" || model === "gpt-4o-mini-transcribe";

    const audioBlob = await refToBlob(audio);
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", model);
    formData.append("temperature", String(temperature));

    if (timestamps) {
      if (isNewModel) {
        throw new Error("New transcription models do not support verbose_json timestamps");
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
      body: formData,
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
      const rawSegments = data.segments as Array<Record<string, unknown>> | undefined;
      if (rawSegments) {
        for (const seg of rawSegments) {
          segments.push({
            timestamp: [Number(seg.start), Number(seg.end)],
            text: String(seg.text),
          });
        }
      }
      const rawWords = data.words as Array<Record<string, unknown>> | undefined;
      if (rawWords) {
        for (const w of rawWords) {
          words.push({
            timestamp: [Number(w.start), Number(w.end)],
            text: String(w.word),
          });
        }
      }
    }

    return { text, words, segments };
  }
}

// ---------------------------------------------------------------------------
// 9. RealtimeAgent (stub — WebSocket not yet implemented)
// ---------------------------------------------------------------------------
export class RealtimeAgentNode extends BaseNode {
  static readonly nodeType = "openai.agents.RealtimeAgent";
            static readonly title = "Realtime Agent";
            static readonly description = "Stream responses using the official OpenAI Realtime client. Supports optional audio input and streams text chunks.\n    realtime, streaming, openai, audio-input, text-output\n\n    Uses `AsyncOpenAI().beta.realtime.connect(...)` with the events API:\n    - Sends session settings via `session.update`\n    - Adds user input via `conversation.item.create`\n    - Streams back `response.text.delta` events until `response.done`";
        static readonly metadataOutputTypes = {
    chunk: "chunk",
    audio: "audio",
    text: "str"
  };
          static readonly basicFields = [
  "model",
  "prompt",
  "chunk",
  "speed"
];
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
          static readonly supportsDynamicOutputs = true;
  
          static readonly isStreamingOutput = true;
  @prop({ type: "enum", default: "gpt-4o-mini-realtime-preview", title: "Model", values: [
  "gpt-4o-realtime-preview",
  "gpt-4o-mini-realtime-preview"
] })
  declare model: any;

  @prop({ type: "str", default: "\nYou are an AI assistant interacting in real-time. Follow these rules unless explicitly overridden by the user:\n\n1. Respond promptly — minimize delay. If you do not yet have a complete answer, acknowledge the question and indicate what you are doing to find the answer.\n2. Maintain correctness. Always aim for accuracy; if you’re uncertain, say so and optionally offer to verify.\n3. Be concise but clear. Prioritize key information first, then supporting details if helpful.\n4. Ask clarifying questions when needed. If the user’s request is ambiguous, request clarification rather than guessing.\n5. Be consistent in terminology and definitions. Once you adopt a term or abbreviation, use it consistently in this conversation.\n6. Respect politeness and neutrality. Do not use emotive language unless the conversation tone demands it.\n7. Stay within safe and ethical bounds. Avoid disallowed content; follow OpenAI policies.\n8. Adapt to the user’s style and level. If the user seems technical, use technical detail; if non-technical, explain with simpler language.\n---\nYou are now active. Await the user’s request.\n", title: "System", description: "System instructions for the realtime session" })
  declare system: any;

  @prop({ type: "chunk", default: {
  "type": "chunk",
  "node_id": null,
  "thread_id": null,
  "workflow_id": null,
  "content_type": "text",
  "content": "",
  "content_metadata": {},
  "done": false,
  "thinking": false
}, title: "Chunk", description: "The audio chunk to use as input." })
  declare chunk: any;

  @prop({ type: "enum", default: "alloy", title: "Voice", description: "The voice for the audio output", values: [
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
] })
  declare voice: any;

  @prop({ type: "float", default: 1, title: "Speed", description: "The speed of the model's spoken response", min: 0.25, max: 1.5 })
  declare speed: any;

  @prop({ type: "float", default: 0.8, title: "Temperature", description: "The temperature for the response", min: 0.6, max: 1.2 })
  declare temperature: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const system = String(inputs.system ?? this.system ?? "");
    const voice = String(inputs.voice ?? this.voice ?? "alloy");
    const speed = Number(inputs.speed ?? this.speed ?? 1);
    const model = String(inputs.model ?? this.model ?? "gpt-4o-mini-realtime-preview");
    const chunk = (inputs.chunk ?? this.chunk ?? {}) as Record<string, unknown>;

    let userText = "";
    if (typeof chunk.content === "string" && chunk.content) {
      if (chunk.content_type === "audio") {
        const formData = new FormData();
        const audioBytes = Buffer.from(chunk.content, "base64");
        formData.append("file", new Blob([audioBytes]), "audio.wav");
        formData.append("model", "gpt-4o-mini-transcribe");
        const transcription = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });
        if (!transcription.ok) {
          const err = await transcription.text();
          throw new Error(`OpenAI realtime transcription error ${transcription.status}: ${err}`);
        }
        const transcriptionJson = (await transcription.json()) as { text?: string };
        userText = transcriptionJson.text ?? "";
      } else {
        userText = chunk.content;
      }
    }

    const res = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: model.replace("-realtime-preview", ""),
        temperature: Number(inputs.temperature ?? this.temperature ?? 0.8),
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: userText || String(inputs.prompt ?? "") || "" },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI RealtimeAgent fallback error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = String(data.choices?.[0]?.message?.content ?? "");

    let audio: Record<string, unknown> | null = null;
    if (voice && voice !== "none" && text) {
      const tts = await fetch(`${OPENAI_API_BASE}/audio/speech`, {
        method: "POST",
        headers: authHeaders(apiKey),
        body: JSON.stringify({
          model: "gpt-4o-mini-tts",
          input: text,
          voice,
          speed,
          response_format: "mp3",
        }),
      });
      if (tts.ok) {
        const audioBytes = await tts.arrayBuffer();
        audio = { data: `data:audio/mp3;base64,${Buffer.from(audioBytes).toString("base64")}` };
      }
    }

    return {
      text,
      output: text,
      chunk: text
        ? { type: "chunk", content_type: "text", content: text, done: true }
        : null,
      audio,
    };
  }
}

// ---------------------------------------------------------------------------
// 10. RealtimeTranscription (stub — WebSocket not yet implemented)
// ---------------------------------------------------------------------------
export class RealtimeTranscriptionNode extends BaseNode {
  static readonly nodeType = "openai.agents.RealtimeTranscription";
            static readonly title = "Realtime Transcription";
            static readonly description = "Stream microphone or audio input to OpenAI Realtime and emit transcription.\n\n    Emits:\n      - `chunk` Chunk(content=..., done=False) for transcript deltas\n      - `chunk` Chunk(content=\"\", done=True) to mark segment end\n      - `text` final aggregated transcript when input ends";
        static readonly metadataOutputTypes = {
    text: "str",
    chunk: "chunk"
  };
          static readonly requiredSettings = [
  "OPENAI_API_KEY"
];
  
          static readonly isStreamingOutput = true;
  @prop({ type: "language_model", default: {
  "type": "language_model",
  "provider": "empty",
  "id": "",
  "name": "",
  "path": null,
  "supported_tasks": []
}, title: "Model", description: "Model to use" })
  declare model: any;

  @prop({ type: "str", default: "", title: "System", description: "System instructions (optional)" })
  declare system: any;

  @prop({ type: "float", default: 0.8, title: "Temperature", description: "Decoding temperature" })
  declare temperature: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const apiKey = getApiKey(inputs);
    const chunk = (inputs.chunk ?? this.chunk ?? inputs.audio ?? {}) as Record<string, unknown>;
    const content =
      typeof chunk.content === "string"
        ? chunk.content
        : typeof chunk.data === "string"
          ? chunk.data
          : "";
    if (!content) {
      return { text: "", chunk: null, output: "" };
    }

    const formData = new FormData();
    formData.append("file", new Blob([Buffer.from(content, "base64")]), "audio.wav");
    formData.append(
      "model",
      String((inputs.model as Record<string, unknown> | undefined)?.id ?? inputs.model ?? "gpt-4o-mini-transcribe")
    );
    if (inputs.system ?? this.system) {
      formData.append("prompt", String(inputs.system ?? this.system ?? ""));
    }

    const res = await fetch(`${OPENAI_API_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI RealtimeTranscription fallback error ${res.status}: ${err}`);
    }
    const data = (await res.json()) as { text?: string };
    const text = data.text ?? "";
    return {
      text,
      output: text,
      chunk: text ? { type: "chunk", content_type: "text", content: text, done: true } : null,
    };
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
  RealtimeTranscriptionNode,
];
