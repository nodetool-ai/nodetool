import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

function getGeminiApiKey(secrets: Record<string, string>): string {
  const key = secrets.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

function getAudioBytes(audio: Record<string, unknown>): Uint8Array {
  if (typeof audio.data === "string") {
    return Uint8Array.from(Buffer.from(audio.data, "base64"));
  }
  if (audio.data instanceof Uint8Array) {
    return audio.data;
  }
  throw new Error("Audio data is required");
}

function getImageBytes(image: Record<string, unknown>): Uint8Array | null {
  if (typeof image.data === "string" && image.data.length > 0) {
    return Uint8Array.from(Buffer.from(image.data, "base64"));
  }
  if (image.data instanceof Uint8Array) {
    return image.data;
  }
  return null;
}

function isRefSet(ref: unknown): boolean {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  return Boolean(r.data || r.uri || r.asset_id);
}

// ── Text nodes ──────────────────────────────────────────────────────────────

export class GroundedSearchNode extends BaseNode {
  static readonly nodeType = "gemini.text.GroundedSearch";
  static readonly title = "Grounded Search";
  static readonly description =
    "Search the web using Google's Gemini API with grounding capabilities.\n    google, search, grounded, web, gemini, ai\n\n    This node uses Google's Gemini API to perform web searches and return structured results\n    with source information. Requires a Gemini API key.\n\n    Use cases:\n    - Research current events and latest information\n    - Find reliable sources for fact-checking\n    - Gather web-based information with citations\n    - Get up-to-date information beyond the model's training data";
  static readonly metadataOutputTypes = {
    results: "list[str]",
    sources: "list[source]"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Query",
    description: "The search query to execute"
  })
  declare query: any;

  @prop({
    type: "enum",
    default: "gemini-2.0-flash",
    title: "Model",
    description: "The Gemini model to use for search",
    values: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getGeminiApiKey(this._secrets);
    const query = String(this.query ?? "");
    const model = String(this.model ?? "gemini-2.0-flash");

    if (!query) throw new Error("Search query is required");

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
      generationConfig: {
        responseMimeType: "text/plain"
      }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
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
        if (typeof part.text === "string") {
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

    return { results, sources };
  }
}

export class EmbeddingNode extends BaseNode {
  static readonly nodeType = "gemini.text.Embedding";
  static readonly title = "Embedding";
  static readonly description =
    "Generate vector representations of text for semantic analysis using Google's Gemini API.\n    embeddings, similarity, search, clustering, classification, gemini\n\n    Uses Google's text embedding models to create dense vector representations of text.\n    These vectors capture semantic meaning, enabling:\n    - Semantic search\n    - Text clustering\n    - Document classification\n    - Recommendation systems\n    - Anomaly detection\n    - Measuring text similarity and diversity";
  static readonly metadataOutputTypes = {
    output: "list"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Input",
    description: "The text to embed."
  })
  declare input: any;

  @prop({
    type: "enum",
    default: "text-embedding-004",
    title: "Model",
    description: "The embedding model to use",
    values: ["text-embedding-004", "gemini-embedding-001"]
  })
  declare model: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getGeminiApiKey(this._secrets);
    const input = String(this.input ?? "");
    const model = String(this.model ?? "text-embedding-004");

    if (!input)
      throw new Error("Input text is required for embedding generation");

    const url = `${GEMINI_API_BASE}/models/${model}:embedContent?key=${apiKey}`;
    const body = {
      content: { parts: [{ text: input }] }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
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

export class ImageGenerationNode extends BaseNode {
  static readonly nodeType = "gemini.image.ImageGeneration";
  static readonly title = "Image Generation";
  static readonly description =
    "Generate an image using Google's Imagen model via the Gemini API.\n    google, image generation, ai, imagen\n\n    Use cases:\n    - Create images from text descriptions\n    - Generate assets for creative projects\n    - Explore AI-powered image synthesis";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the image to generate."
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "imagen-3.0-generate-002",
    title: "Model",
    description: "The image generation model to use",
    values: [
      "gemini-2.0-flash-preview-image-generation",
      "gemini-2.5-flash-image-preview",
      "gemini-3-pro-image-preview",
      "imagen-3.0-generate-001",
      "imagen-3.0-generate-002",
      "imagen-4.0-generate-001"
    ]
  })
  declare model: any;

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
  declare image: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getGeminiApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const model = String(this.model ?? "imagen-3.0-generate-002");
    const image = (this.image ?? {}) as Record<string, unknown>;

    if (!prompt) throw new Error("The input prompt cannot be empty.");

    // Gemini image-capable models use generateContent with IMAGE+TEXT modalities
    if (model.startsWith("gemini-")) {
      const contentParts: Array<Record<string, unknown>> = [{ text: prompt }];

      // Add optional input image
      const imageBytes = getImageBytes(image);
      if (imageBytes) {
        contentParts.push({
          inline_data: {
            mime_type: "image/png",
            data: Buffer.from(imageBytes).toString("base64")
          }
        });
      }

      const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
      const body = {
        contents: [{ parts: contentParts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"]
        }
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${errText}`);
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
        // Also check snake_case variant from API
        const inlineData2 = part.inline_data as
          | Record<string, unknown>
          | undefined;
        const d = inlineData ?? inlineData2;
        if (d && typeof d.data === "string") {
          return { output: { type: "image", data: d.data } };
        }
      }

      throw new Error("No image bytes returned in response");
    }

    // Imagen models use the generateImages endpoint
    const url = `${GEMINI_API_BASE}/models/${model}:generateImages?key=${apiKey}`;
    const body = {
      prompt,
      config: { numberOfImages: 1 }
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
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

export class TextToVideoGeminiNode extends BaseNode {
  static readonly nodeType = "gemini.video.TextToVideo";
  static readonly title = "Text To Video";
  static readonly description =
    "Generate videos from text prompts using Google's Veo models.\n    google, video, generation, text-to-video, veo, ai\n\n    This node uses Google's Veo models to generate high-quality videos from text descriptions.\n    Supports 720p resolution at 24fps with 8-second duration and native audio generation.";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "The text prompt describing the video to generate"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "veo-3.1-generate-preview",
    title: "Model",
    description: "The Veo model to use for video generation",
    values: ["veo-3.1-generate-preview", "veo-2.0-generate-001"]
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video",
    values: ["16:9", "9:16"]
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Negative prompt to guide what to avoid in the video"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getGeminiApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    const model = String(this.model ?? "veo-3.1-generate-preview");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const negativePrompt = String(this.negative_prompt ?? "");

    if (!prompt) throw new Error("Video generation prompt is required");

    // Start the long-running video generation operation
    const url = `${GEMINI_API_BASE}/models/${model}:generateVideos?key=${apiKey}`;
    const config: Record<string, unknown> = {};
    if (aspectRatio) config.aspectRatio = aspectRatio;
    if (negativePrompt) config.negativePrompt = negativePrompt;

    const body: Record<string, unknown> = {
      prompt
    };
    if (Object.keys(config).length > 0) body.config = config;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const operation = (await res.json()) as Record<string, unknown>;
    const videoData = await pollVideoOperation(apiKey, operation);
    return { output: { type: "video", data: videoData } };
  }
}

export class ImageToVideoGeminiNode extends BaseNode {
  static readonly nodeType = "gemini.video.ImageToVideo";
  static readonly title = "Image To Video";
  static readonly description =
    "Generate videos from images using Google's Veo models.\n    google, video, generation, image-to-video, veo, ai, animation\n\n    This node uses Google's Veo models to animate static images into dynamic videos.\n    Supports 720p resolution at 24fps with 8-second duration and native audio generation.";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
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
    description: "The image to animate into a video"
  })
  declare image: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Optional text prompt describing the desired animation"
  })
  declare prompt: any;

  @prop({
    type: "enum",
    default: "veo-3.1-generate-preview",
    title: "Model",
    description: "The Veo model to use for video generation",
    values: ["veo-3.1-generate-preview", "veo-2.0-generate-001"]
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Aspect Ratio",
    description: "The aspect ratio of the generated video",
    values: ["16:9", "9:16"]
  })
  declare aspect_ratio: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Negative prompt to guide what to avoid in the video"
  })
  declare negative_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getGeminiApiKey(this._secrets);
    const image = (this.image ?? {}) as Record<string, unknown>;
    const prompt = String(this.prompt ?? "Animate this image");
    const model = String(this.model ?? "veo-3.1-generate-preview");
    const aspectRatio = String(this.aspect_ratio ?? "16:9");
    const negativePrompt = String(this.negative_prompt ?? "");

    if (!isRefSet(image)) throw new Error("Input image is required");

    const imageBytes = getImageBytes(image);
    if (!imageBytes) throw new Error("Image data is required");

    const config: Record<string, unknown> = {};
    if (aspectRatio) config.aspectRatio = aspectRatio;
    if (negativePrompt) config.negativePrompt = negativePrompt;

    const url = `${GEMINI_API_BASE}/models/${model}:generateVideos?key=${apiKey}`;
    const body: Record<string, unknown> = {
      prompt: prompt || "Animate this image",
      image: {
        imageBytes: Buffer.from(imageBytes).toString("base64"),
        mimeType: "image/png"
      }
    };
    if (Object.keys(config).length > 0) body.config = config;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const operation = (await res.json()) as Record<string, unknown>;
    const videoData = await pollVideoOperation(apiKey, operation);
    return { output: { type: "video", data: videoData } };
  }
}

async function pollVideoOperation(
  apiKey: string,
  operation: Record<string, unknown>
): Promise<string> {
  // If the operation already has the result, return it
  if (operation.done) {
    return extractVideoFromResponse(operation);
  }

  // Otherwise poll the operation
  const opName = operation.name as string | undefined;
  if (!opName) throw new Error("No operation name in response");

  const maxAttempts = 120; // 10 minutes at 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${apiKey}`;
    const pollRes = await fetch(pollUrl);
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`Gemini poll error ${pollRes.status}: ${errText}`);
    }

    const pollData = (await pollRes.json()) as Record<string, unknown>;
    if (pollData.done) {
      return extractVideoFromResponse(pollData);
    }
  }

  throw new Error("Video generation timed out");
}

function extractVideoFromResponse(data: Record<string, unknown>): string {
  const response = (data.response ?? data) as Record<string, unknown>;
  const generatedVideos = response.generatedVideos as
    | Array<Record<string, unknown>>
    | undefined;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error("No video generated");
  }

  const video = generatedVideos[0].video as Record<string, unknown> | undefined;
  if (!video) throw new Error("No video in response");

  const videoBytes = video.videoBytes as string | undefined;
  if (!videoBytes) throw new Error("No video bytes in response");

  return videoBytes;
}

// ── Audio nodes ─────────────────────────────────────────────────────────────

export class TextToSpeechGeminiNode extends BaseNode {
  static readonly nodeType = "gemini.audio.TextToSpeech";
  static readonly title = "Text To Speech";
  static readonly description =
    "Generate speech audio from text using Google's Gemini text-to-speech models.\n    google, text-to-speech, tts, audio, speech, voice, ai\n\n    This node converts text input into natural-sounding speech audio using Google's\n    advanced text-to-speech models with support for multiple voices and speech styles.\n\n    Supported voices:\n    - achernar, achird, algenib, algieba, alnilam\n    - aoede, autonoe, callirrhoe, charon, despina\n    - enceladus, erinome, fenrir, gacrux, iapetus\n    - kore, laomedeia, leda, orus, puck\n    - pulcherrima, rasalgethi, sadachbia, sadaltager, schedar\n    - sulafat, umbriel, vindemiatrix, zephyr, zubenelgenubi\n\n    Use cases:\n    - Create voiceovers for videos and presentations\n    - Generate audio content for podcasts and audiobooks\n    - Add voice narration to applications\n    - Create accessibility features with speech output\n    - Generate multilingual audio content";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
  static readonly exposeAsTool = true;

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "The text to convert to speech."
  })
  declare text: any;

  @prop({
    type: "enum",
    default: "gemini-2.5-pro-preview-tts",
    title: "Model",
    description: "The text-to-speech model to use",
    values: ["gemini-2.5-pro-preview-tts"]
  })
  declare model: any;

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
  declare voice_name: any;

  @prop({
    type: "str",
    default: "",
    title: "Style Prompt",
    description:
      "Optional style prompt to control speech characteristics (e.g., 'Say cheerfully', 'Speak with excitement')"
  })
  declare style_prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getGeminiApiKey(this._secrets);
    const text = String(this.text ?? "");
    const model = String(this.model ?? "gemini-2.5-pro-preview-tts");
    const stylePrompt = String(this.style_prompt ?? "");

    const VALID_VOICES = [
      "achernar", "achird", "algenib", "algieba", "alnilam",
      "aoede", "autonoe", "callirrhoe", "charon", "despina",
      "enceladus", "erinome", "fenrir", "gacrux", "iapetus",
      "kore", "laomedeia", "leda", "orus", "puck",
      "pulcherrima", "rasalgethi", "sadachbia", "sadaltager", "schedar",
      "sulafat", "umbriel", "vindemiatrix", "zephyr", "zubenelgenubi"
    ];
    const rawVoice = String(this.voice_name ?? "kore").toLowerCase();
    const voiceName = VALID_VOICES.includes(rawVoice) ? rawVoice : "kore";

    if (!text) throw new Error("The input text cannot be empty.");

    let content = text;
    if (stylePrompt) {
      content = `${stylePrompt}: ${text}`;
    }

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
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

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
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
      if (inlineData && typeof inlineData.data === "string") {
        // The API returns raw PCM audio at 24kHz, 16-bit mono
        // Encode as WAV for the audio ref
        const pcmBase64 = inlineData.data;
        const pcmBytes = Buffer.from(pcmBase64, "base64");
        const wavBytes = encodeWav(pcmBytes, 24000, 1, 16);
        return {
          output: {
            uri: "",
            data: Buffer.from(wavBytes).toString("base64")
          }
        };
      }
    }

    throw new Error("No audio data found in the response");
  }
}

export class TranscribeGeminiNode extends BaseNode {
  static readonly nodeType = "gemini.audio.Transcribe";
  static readonly title = "Transcribe";
  static readonly description =
    "Transcribe audio to text using Google's Gemini models.\n    google, transcription, speech-to-text, audio, whisper, ai\n\n    This node converts audio input into text using Google's multimodal Gemini models.\n    Supports various audio formats and provides accurate speech-to-text transcription.\n\n    Use cases:\n    - Convert recorded audio to text\n    - Transcribe podcasts and interviews\n    - Generate subtitles from audio tracks\n    - Create meeting notes from audio recordings\n    - Analyze speech content in audio files";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  static readonly requiredSettings = ["GEMINI_API_KEY"];
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
    description: "The audio file to transcribe."
  })
  declare audio: any;

  @prop({
    type: "enum",
    default: "gemini-2.5-flash",
    title: "Model",
    description: "The Gemini model to use for transcription",
    values: ["gemini-2.5-flash", "gemini-2.0-flash"]
  })
  declare model: any;

  @prop({
    type: "str",
    default:
      "Transcribe the following audio accurately. Return only the transcription text without any additional commentary.",
    title: "Prompt",
    description:
      "Instructions for the transcription. You can customize this to request specific formatting or focus."
  })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getGeminiApiKey(this._secrets);
    const audio = (this.audio ?? {}) as Record<string, unknown>;
    const model = String(this.model ?? "gemini-2.5-flash");
    const prompt = String(
      this.prompt ??
        this.prompt ??
        "Transcribe the following audio accurately. Return only the transcription text without any additional commentary."
    );

    if (!isRefSet(audio))
      throw new Error("Audio file is required for transcription");

    const audioBytes = getAudioBytes(audio);

    // Detect MIME type from first bytes (simple magic-number check)
    const mimeType = detectAudioMime(audioBytes);

    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
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

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
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
      if (typeof part.text === "string") {
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

function encodeWav(
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

// ── Exports ─────────────────────────────────────────────────────────────────

export const GEMINI_NODES: readonly NodeClass[] = [
  GroundedSearchNode,
  EmbeddingNode,
  ImageGenerationNode,
  TextToVideoGeminiNode,
  ImageToVideoGeminiNode,
  TextToSpeechGeminiNode,
  TranscribeGeminiNode
];
