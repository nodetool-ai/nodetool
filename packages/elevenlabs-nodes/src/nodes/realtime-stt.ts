import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  NodeClass,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";

export class RealtimeSpeechToTextNode extends BaseNode {
  static readonly nodeType = "elevenlabs.RealtimeSpeechToText";
  static readonly title = "Realtime Speech to Text";
  static readonly description =
    "Realtime speech-to-text transcription using ElevenLabs WebSocket API.\n" +
    "Streams audio chunks in and receives transcription results in real-time.\n" +
    "audio, transcription, stt, streaming, realtime, websocket, elevenlabs\n\n" +
    "Use cases:\n" +
    "- Real-time audio transcription\n" +
    "- Live captioning\n" +
    "- Voice-driven applications\n" +
    "- Interactive transcription with speaker detection";
  static readonly metadataOutputTypes = { chunk: "chunk" };
  static readonly requiredSettings = ["ELEVENLABS_API_KEY"];
  static readonly isStreamingInput = true;
  static readonly isStreamingOutput = true;

  @prop({
    type: "chunk",
    default: "",
    title: "Chunk",
    description: "Audio chunk input stream (base64-encoded PCM16 audio)."
  })
  declare chunk: any;

  @prop({
    type: "str",
    default: "scribe_v2_realtime",
    title: "Model",
    description: "The realtime transcription model to use."
  })
  declare model_id: any;

  @prop({
    type: "str",
    default: "",
    title: "Language Code",
    description: "ISO 639-1/3 language code. Leave empty for auto-detection."
  })
  declare language_code: any;

  @prop({
    type: "enum",
    default: "vad",
    title: "Commit Strategy",
    description:
      "Strategy for committing transcriptions: manual or voice activity detection.",
    values: ["manual", "vad"]
  })
  declare commit_strategy: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Timestamps",
    description: "Include word-level timestamps in the transcription."
  })
  declare include_timestamps: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Language Detection",
    description: "Include language detection in the transcription."
  })
  declare include_language_detection: any;

  @prop({
    type: "float",
    default: 1.5,
    title: "VAD Silence Threshold",
    description: "Silence threshold in seconds for VAD mode.",
    min: 0.1,
    max: 10.0
  })
  declare vad_silence_threshold_secs: any;

  @prop({
    type: "float",
    default: 0.4,
    title: "VAD Threshold",
    description: "Threshold for voice activity detection.",
    min: 0.0,
    max: 1.0
  })
  declare vad_threshold: any;

  @prop({
    type: "int",
    default: 100,
    title: "Min Speech Duration",
    description: "Minimum speech duration in milliseconds.",
    min: 0,
    max: 5000
  })
  declare min_speech_duration_ms: any;

  @prop({
    type: "int",
    default: 100,
    title: "Min Silence Duration",
    description: "Minimum silence duration in milliseconds.",
    min: 0,
    max: 5000
  })
  declare min_silence_duration_ms: any;

  // Required by BaseNode but unused for streaming
  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    // Get API key from context or env
    let apiKey = "";
    if (context && typeof (context as any).getSecret === "function") {
      apiKey = (await (context as any).getSecret("ELEVENLABS_API_KEY")) || "";
    }
    if (!apiKey) apiKey = process.env.ELEVENLABS_API_KEY || "";
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured");

    const modelId = String(this.model_id ?? "scribe_v2_realtime");
    const languageCode = String(this.language_code ?? "");
    const commitStrategy = String(this.commit_strategy ?? "vad");
    const includeTimestamps = String(
      this.include_timestamps ?? false
    ).toLowerCase();
    const includeLanguageDetection = String(
      this.include_language_detection ?? false
    ).toLowerCase();
    const vadSilenceThreshold = String(this.vad_silence_threshold_secs ?? 1.5);
    const vadThreshold = String(this.vad_threshold ?? 0.4);
    const minSpeechDuration = String(this.min_speech_duration_ms ?? 100);
    const minSilenceDuration = String(this.min_silence_duration_ms ?? 100);

    // Build WebSocket URL.
    // Use pcm_44100 as default since the browser AudioContext typically
    // captures at 44100 Hz.  The per-chunk sample_rate field in the
    // input_audio_chunk message can override this if the actual rate differs.
    const params = new URLSearchParams({
      model_id: modelId,
      audio_format: "pcm_44100",
      commit_strategy: commitStrategy,
      include_timestamps: includeTimestamps,
      include_language_detection: includeLanguageDetection,
      vad_silence_threshold_secs: vadSilenceThreshold,
      vad_threshold: vadThreshold,
      min_speech_duration_ms: minSpeechDuration,
      min_silence_duration_ms: minSilenceDuration
    });
    if (languageCode) {
      params.set("language_code", languageCode);
    }
    const wsUrl = `wss://api.elevenlabs.io/v1/speech-to-text/realtime?${params}`;

    const { WebSocket } = await import("ws");
    const ws = new WebSocket(wsUrl, { headers: { "xi-api-key": apiKey } });

    await new Promise<void>((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });

    // Wait for session_started message
    await new Promise<void>((resolve, reject) => {
      const onMsg = (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          if (msg.message_type === "session_started") {
            ws.removeListener("message", onMsg);
            resolve();
          }
        } catch (err) {
          reject(err);
        }
      };
      ws.on("message", onMsg);
      ws.on("error", reject);
    });

    // Set up consumer for transcription results
    let consumerDone = false;
    let finalizeRequested = false;
    let resolveFinalTranscript!: () => void;
    const finalTranscriptPromise = new Promise<void>((resolve) => {
      resolveFinalTranscript = resolve;
    });
    const consumerPromise = new Promise<void>((resolve, reject) => {
      ws.on("message", async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          const msgType = String(msg.message_type ?? "");

          if (
            msgType === "partial_transcript" ||
            msgType === "committed_transcript"
          ) {
            const text = String(msg.text ?? "");
            if (text) {
              await outputs.emit("chunk", {
                type: "chunk",
                content: text,
                done: false,
                content_type: "text"
              });
              if (finalizeRequested && msgType === "committed_transcript") {
                resolveFinalTranscript();
              }
            }
          } else if (msgType === "committed_transcript_with_timestamps") {
            const text = String(msg.text ?? "");
            if (text) {
              const metadata: Record<string, unknown> = {};
              if (msg.language_code) metadata.language_code = msg.language_code;
              if (msg.words) metadata.words = msg.words;
              await outputs.emit("chunk", {
                type: "chunk",
                content: text,
                done: false,
                content_type: "text",
                content_metadata: metadata
              });
              if (finalizeRequested) {
                resolveFinalTranscript();
              }
            }
          } else if (msgType.includes("error")) {
            reject(new Error(`Transcription error: ${msg.error ?? msgType}`));
          }
        } catch (err) {
          if (!consumerDone) reject(err);
        }
      });

      ws.on("error", (err: Error) => {
        if (!consumerDone) reject(err);
      });

      ws.on("close", (_code: number, _reason?: Buffer) => {
        consumerDone = true;
        resolve();
      });
    });

    // Producer: read streaming audio input and forward to WebSocket.
    // Detect sample rate from the first chunk's content_metadata, falling
    // back to the WS URL parameter value (pcm_16000 → 16000).
    let detectedSampleRate = 16000;
    let sampleRateDetected = false;
    for await (const [handle, item] of inputs.any()) {
      if (handle === "__control__") continue;

      const chunk = item as Record<string, unknown> | string;
      let audioB64: string;
      let done = false;

      if (typeof chunk === "string") {
        audioB64 = chunk;
      } else {
        // Detect sample rate from first chunk's metadata
        if (!sampleRateDetected && chunk.content_metadata) {
          const meta = chunk.content_metadata as Record<string, unknown>;
          if (typeof meta.sample_rate === "number" && meta.sample_rate > 0) {
            detectedSampleRate = meta.sample_rate;
          }
          sampleRateDetected = true;
        }

        if (chunk.content_type && chunk.content_type !== "audio") {
          continue;
        }
        audioB64 = String(chunk.content ?? "");
        done = Boolean(chunk.done ?? false);
      }

      if (done) {
        break;
      }
      if (!audioB64) {
        continue;
      }

      ws.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: audioB64,
          commit: false,
          sample_rate: detectedSampleRate
        })
      );
    }

    // Flush the final segment before closing so the last transcript is delivered.
    finalizeRequested = true;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: "",
          commit: true,
          sample_rate: detectedSampleRate
        })
      );
    }

    // Wait briefly for the final committed transcript, then close cleanly.
    await Promise.race([
      consumerPromise,
      finalTranscriptPromise,
      new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      })
    ]);

    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }

    await consumerPromise;

    // Emit final done chunk
    await outputs.emit("chunk", {
      type: "chunk",
      content: "",
      done: true,
      content_type: "text"
    });
  }
}

export const REALTIME_STT_NODES: readonly NodeClass[] = [
  RealtimeSpeechToTextNode
];
