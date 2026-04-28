import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  NodeClass,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  getElevenLabsApiKey,
  VOICE_ID_MAP,
  VOICE_NAMES
} from "../elevenlabs-base.js";

export class RealtimeTextToSpeechNode extends BaseNode {
  static readonly nodeType = "elevenlabs.RealtimeTextToSpeech";
  static readonly title = "Realtime Text to Speech";
  static readonly description =
    "Stream text-to-speech using ElevenLabs WebSocket API.\n" +
    "Consumes text chunks and outputs audio chunks in real-time.\n" +
    "audio, tts, speech, streaming, realtime, websocket, elevenlabs\n\n" +
    "Use cases:\n" +
    "- Real-time voice generation from streaming text\n" +
    "- Interactive voice applications\n" +
    "- Low-latency text-to-speech conversion\n" +
    "- Streaming dialogue generation";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly requiredSettings = ["ELEVENLABS_API_KEY"];
  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;

  @prop({
    type: "enum",
    default: "Aria",
    title: "Voice",
    description: "Voice to use for generation.",
    values: VOICE_NAMES
  })
  declare voice: any;

  @prop({
    type: "chunk",
    default: "",
    title: "Chunk",
    description: "Text chunk input stream."
  })
  declare chunk: any;

  @prop({
    type: "enum",
    default: "eleven_turbo_v2_5",
    title: "Model",
    description: "The TTS model to use.",
    values: [
      "eleven_multilingual_v2",
      "eleven_turbo_v2_5",
      "eleven_flash_v2_5",
      "eleven_turbo_v2",
      "eleven_flash_v2"
    ]
  })
  declare model_id: any;

  @prop({
    type: "enum",
    default: "none",
    title: "Language",
    description: "Language code to enforce (works with Turbo v2.5+).",
    values: [
      "none",
      "en",
      "ja",
      "zh",
      "de",
      "hi",
      "fr",
      "ko",
      "pt",
      "it",
      "es",
      "ru",
      "id",
      "nl",
      "tr",
      "fil",
      "pl",
      "sv",
      "bg",
      "ro",
      "ar",
      "cs",
      "el",
      "fi",
      "hr",
      "ms",
      "sk",
      "da",
      "ta",
      "uk",
      "vi",
      "no",
      "hu"
    ]
  })
  declare language_code: any;

  @prop({
    type: "enum",
    default: "mp3_44100_128",
    title: "Output Format",
    description: "Audio output format for streaming.",
    values: [
      "mp3_22050_32",
      "mp3_44100_32",
      "mp3_44100_64",
      "mp3_44100_96",
      "mp3_44100_128",
      "mp3_44100_192",
      "pcm_8000",
      "pcm_16000",
      "pcm_22050",
      "pcm_24000",
      "pcm_44100",
      "ulaw_8000",
      "alaw_8000",
      "opus_48000_32",
      "opus_48000_64",
      "opus_48000_96",
      "opus_48000_128",
      "opus_48000_192"
    ]
  })
  declare output_format: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Stability",
    description: "Voice stability (0-1).",
    min: 0.0,
    max: 1.0
  })
  declare stability: any;

  @prop({
    type: "float",
    default: 0.75,
    title: "Similarity Boost",
    description: "Similarity to original voice (0-1).",
    min: 0.0,
    max: 1.0
  })
  declare similarity_boost: any;

  @prop({
    type: "float",
    default: 0.0,
    title: "Style",
    description: "Speaking style emphasis (0-1).",
    min: 0.0,
    max: 1.0
  })
  declare style: any;

  @prop({
    type: "bool",
    default: true,
    title: "Speaker Boost",
    description: "Use speaker boost for clearer output."
  })
  declare use_speaker_boost: any;

  @prop({
    type: "float",
    default: 1.0,
    title: "Speed",
    description: "Speed of generated speech (0.7-1.2).",
    min: 0.7,
    max: 1.2
  })
  declare speed: any;

  @prop({
    type: "bool",
    default: false,
    title: "Enable SSML",
    description: "Enable SSML parsing in text input."
  })
  declare enable_ssml_parsing: any;

  // Required by BaseNode but unused for streaming - run() handles everything
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    // Inject secrets manually since run() bypasses _injectSecrets
    const secretsCtx = context as Record<string, unknown> | undefined;
    let apiKey = "";
    if (secretsCtx && typeof (secretsCtx as any).getSecret === "function") {
      apiKey =
        (await (secretsCtx as any).getSecret("ELEVENLABS_API_KEY")) || "";
    }
    if (!apiKey) apiKey = process.env.ELEVENLABS_API_KEY || "";
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

    const voice = String(this.voice ?? "Aria");
    const voiceId = VOICE_ID_MAP[voice];
    if (!voiceId) throw new Error(`Unknown voice: ${voice}`);

    const modelId = String(this.model_id ?? "eleven_turbo_v2_5");
    const languageCode = String(this.language_code ?? "none");
    const outputFormat = String(this.output_format ?? "mp3_44100_128");
    const enableSsml = String(this.enable_ssml_parsing ?? false).toLowerCase();

    // Build WebSocket URL
    const params = new URLSearchParams({
      model_id: modelId,
      output_format: outputFormat,
      enable_ssml_parsing: enableSsml
    });
    if (languageCode !== "none") {
      params.set("language_code", languageCode);
    }
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream-input?${params}`;

    // Determine audio metadata from output format
    const formatParts = outputFormat.split("_");
    const encoding = formatParts[0];
    const sampleRate = parseInt(formatParts[1], 10) || 44100;
    const audioMetadata = {
      sample_rate: sampleRate,
      channels: 1,
      encoding,
      format: outputFormat
    };

    // Dynamic import of ws for WebSocket support in Node.js
    const { WebSocket } = await import("ws");
    const ws = new WebSocket(wsUrl, { headers: { "xi-api-key": apiKey } });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    // Send initialization message with voice settings
    ws.send(
      JSON.stringify({
        text: " ",
        voice_settings: {
          stability: Number(this.stability ?? 0.5),
          similarity_boost: Number(this.similarity_boost ?? 0.75),
          style: Number(this.style ?? 0.0),
          use_speaker_boost: Boolean(this.use_speaker_boost ?? true),
          speed: Number(this.speed ?? 1.0)
        }
      })
    );

    // Set up consumer: listen for WebSocket messages and emit audio chunks
    let consumerDone = false;
    const consumerPromise = new Promise<void>((resolve, reject) => {
      ws.on("message", async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;

          if (msg.isFinal) {
            await outputs.emit("chunk", {
              type: "chunk",
              content: "",
              done: true,
              content_type: "audio",
              content_metadata: audioMetadata
            });
            consumerDone = true;
            resolve();
            return;
          }

          if (msg.audio && typeof msg.audio === "string") {
            await outputs.emit("chunk", {
              type: "chunk",
              content: msg.audio,
              done: false,
              content_type: "audio",
              content_metadata: audioMetadata
            });
          }
        } catch (err) {
          reject(err);
        }
      });

      ws.on("error", (err: Error) => {
        if (!consumerDone) reject(err);
      });

      ws.on("close", (_code: number, reason?: Buffer) => {
        void reason?.toString();
        if (!consumerDone) resolve();
      });
    });

    // Producer: read streaming text input and forward to WebSocket
    try {
      for await (const [handle, item] of inputs.any()) {
        if (handle === "__control__") continue;

        const chunk = item as Record<string, unknown> | string;
        let content: string;
        let done = false;

        if (typeof chunk === "string") {
          content = chunk;
        } else {
          content = String(chunk.content ?? "");
          done = Boolean(chunk.done ?? false);
        }

        if (content && !done) {
          ws.send(JSON.stringify({ text: content + " " }));
        }

        if (done) break;
      }
    } finally {
      // Send empty string to close the ElevenLabs stream
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ text: "" }));
      }
    }

    // Wait for consumer to finish receiving audio
    await consumerPromise;

    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
}

export const REALTIME_TTS_NODES: readonly NodeClass[] = [
  RealtimeTextToSpeechNode
];
