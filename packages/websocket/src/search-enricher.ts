/**
 * Captions and transcripts for library search (docs/plans/library-search.md,
 * D15). Both run through the generation seam with a `library-search-` job
 * id, so their cost lands in the prediction ledger and counts toward the
 * daily spend limit. Installed in the indexer process only.
 */

import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSecret } from "@nodetool-ai/models";
import { messageText, ProcessingContext, type Message } from "@nodetool-ai/runtime";
import { convertAudioToWav } from "@nodetool-ai/runtime/media";
import {
  EMBED_JOB_PREFIX,
  type EnrichInput,
  type LibraryEnricher,
  type TranscriptSegment
} from "@nodetool-ai/search-services";

/** What a caption asks for: words a person would search with, not prose. */
const CAPTION_PROMPT =
  "Describe this image for a search index in two or three plain sentences: " +
  "the subject, the setting, notable objects, any visible text, and the style. " +
  "Do not guess names of people.";

function contextFor(userId: string): ProcessingContext {
  return new ProcessingContext({
    jobId: `${EMBED_JOB_PREFIX}${randomUUID()}`,
    userId,
    secretResolver: getSecret
  });
}

async function caption(input: EnrichInput): Promise<string> {
  const messages: Message[] = [
    {
      role: "user",
      content: [
        { type: "image_url", image: { data: input.bytes, mimeType: input.contentType ?? "image/png" } },
        { type: "text", text: CAPTION_PROMPT }
      ]
    }
  ];
  const result = (await contextFor(input.userId).runProviderPrediction({
    provider: input.model.provider,
    capability: "generate_message",
    model: input.model.model,
    params: { messages, max_tokens: 300, temperature: 0 }
  })) as Message | null;
  return result ? messageText(result.content) : "";
}

/** 16 kHz mono WAV: what speech-to-text models expect, and the audio track of a video. */
async function speechWav(bytes: Uint8Array): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "nodetool-transcript-"));
  try {
    const out = join(dir, "speech.wav");
    await convertAudioToWav(bytes, out, { sampleRate: 16_000, channels: 1 });
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function segmentsOf(result: unknown): TranscriptSegment[] {
  if (typeof result === "string") return [{ text: result }];
  if (!result || typeof result !== "object") return [];
  const { text, chunks } = result as { text?: unknown; chunks?: unknown };
  if (Array.isArray(chunks) && chunks.length > 0) {
    return chunks.flatMap((chunk): TranscriptSegment[] => {
      const { text: part, timestamp } = (chunk ?? {}) as { text?: unknown; timestamp?: unknown };
      if (typeof part !== "string") return [];
      const [start, end] = Array.isArray(timestamp) ? timestamp : [];
      return [
        {
          text: part,
          start: typeof start === "number" ? start : undefined,
          end: typeof end === "number" ? end : undefined
        }
      ];
    });
  }
  return typeof text === "string" ? [{ text }] : [];
}

async function transcribe(input: EnrichInput): Promise<TranscriptSegment[]> {
  const audio = await speechWav(input.bytes);
  const result = await contextFor(input.userId).runProviderPrediction({
    provider: input.model.provider,
    capability: "automatic_speech_recognition",
    model: input.model.model,
    params: { audio }
  });
  return segmentsOf(result);
}

export const providerLibraryEnricher: LibraryEnricher = { caption, transcribe };

export const __testing = { segmentsOf };
