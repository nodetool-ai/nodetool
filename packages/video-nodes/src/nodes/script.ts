/**
 * Script nodes — operate on persisted scripts (the script editor's documents)
 * referenced by the `script` type. A script owns its text; audio is derived.
 *
 * - LoadScript reads a script's text and metadata for downstream LLM/text nodes.
 * - VoiceScript batch-synthesizes every draft/stale line with its cast voice,
 *   appending a take per line and persisting the script.
 * - ScriptToTimeline assembles the current takes into a voiceover sequence,
 *   the headless mirror of the editor's "Send to timeline".
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ScriptRef } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { concatBytes, encodePcm16Wav } from "@nodetool-ai/audio-nodes";
import {
  assembleSubtitleCues,
  formatSubtitles,
  makeClip,
  makeSequence,
  makeTrack,
  type CaptionWord,
  type SubtitleEntry,
  type SubtitleFormat,
  type SubtitleGranularity,
  type TimelineClip,
  type TimelineSequence,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import { tagAsNode } from "@nodetool-ai/nodes-utils";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ffprobeDuration } from "./ffmpeg-helpers.js";

const scriptRefDefault = { type: "script", id: null, data: null } as const;

/** Fallback clip length for a take whose duration could not be determined. */
const PLACEHOLDER_LINE_MS = 3000;

// ── Script document shapes (structurally match @nodetool-ai/models Script) ──

interface VoiceBindingLike {
  provider: string;
  model: string;
  voice: string;
  settings?: Record<string, unknown>;
}

interface ScriptTakeLike {
  id: string;
  assetId: string;
  durationMs: number;
  words: CaptionWord[];
  textSnapshot: string;
  voiceSnapshot: VoiceBindingLike | null;
  createdAt: string;
  favorite?: boolean;
  costCredits?: number;
}

interface ScriptLineLike {
  id: string;
  speakerId?: string | null;
  text: string;
  direction?: string;
  pauseAfterMs?: number;
  voiceOverride?: VoiceBindingLike | null;
  takes: ScriptTakeLike[];
  currentTakeId?: string | null;
}

interface ScriptSpeakerLike {
  id: string;
  name: string;
  color?: string;
  voice?: VoiceBindingLike | null;
}

interface ScriptDocumentLike {
  cast: ScriptSpeakerLike[];
  sections: { id: string; title?: string; lines: ScriptLineLike[] }[];
}

interface ScriptResponseLike {
  id: string;
  projectId: string;
  name: string;
  document: ScriptDocumentLike;
  timelineId?: string;
  updatedAt: string;
}

interface ScriptRefLike {
  type?: string;
  id?: string | null;
  data?: unknown;
}

async function loadScript(
  ref: unknown,
  context: ProcessingContext | undefined
): Promise<ScriptResponseLike> {
  const scriptRef = (ref ?? {}) as ScriptRefLike;
  if (!scriptRef.id) {
    throw new Error(
      "Script input is empty — connect a Constant Script node and pick a script"
    );
  }
  if (!context) {
    throw new Error("Script nodes require a processing context");
  }
  const script = (await context.getScript(
    scriptRef.id
  )) as ScriptResponseLike | null;
  if (!script) {
    throw new Error(`Script not found: ${scriptRef.id}`);
  }
  return script;
}

const allLines = (doc: ScriptDocumentLike): ScriptLineLike[] =>
  doc.sections.flatMap((s) => s.lines);

const currentTake = (line: ScriptLineLike): ScriptTakeLike | undefined =>
  line.takes.find((t) => t.id === line.currentTakeId);

/** The voice a line will be voiced with: its override, else its speaker's. */
const effectiveVoice = (
  line: ScriptLineLike,
  cast: ScriptSpeakerLike[]
): VoiceBindingLike | null => {
  if (line.voiceOverride) return line.voiceOverride;
  const speaker = cast.find((s) => s.id === line.speakerId);
  return speaker?.voice ?? null;
};

/** Whether a line needs (re-)voicing: no current take, or text/voice drifted. */
const needsVoicing = (
  line: ScriptLineLike,
  voice: VoiceBindingLike | null
): boolean => {
  const take = currentTake(line);
  if (!take) return true;
  return (
    take.textSnapshot !== line.text ||
    JSON.stringify(take.voiceSnapshot) !== JSON.stringify(voice)
  );
};

// ── Nodes ────────────────────────────────────────────────────────────────────

export class LoadScriptNode extends BaseNode {
  static readonly nodeType = "nodetool.script.LoadScript";
  static readonly title = "Load Script";
  static readonly description =
    "Read a persisted script's text and metadata.\n    script, text, voiceover, narration, load\n\n    Use cases:\n    - Feed a script's text into an LLM or text node\n    - Inspect line count and cast before voicing\n    - Branch a workflow on a script's contents";
  static readonly metadataOutputTypes = {
    text: "str",
    lines: "list[str]",
    name: "str",
    line_count: "int"
  };
  static readonly inlineFields = ["script"];
  static readonly inputFields = ["script"];

  @prop({
    type: "script",
    default: scriptRefDefault,
    title: "Script",
    description: "The script to read."
  })
  declare script: ScriptRef;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const script = await loadScript(this.script, context);
    const lines = allLines(script.document).map((line) => line.text);
    return {
      text: lines.join("\n"),
      lines,
      name: script.name,
      line_count: lines.length
    };
  }
}

export class VoiceScriptNode extends BaseNode {
  static readonly nodeType = "nodetool.script.VoiceScript";
  static readonly title = "Voice Script";
  static readonly description =
    "Synthesize speech for every draft or stale line of a script, using each line's cast voice, and save the takes back onto the script. Lines already up to date, or with no text or no voice, are skipped.\n    script, voiceover, tts, narration, batch\n\n    Use cases:\n    - Voice an LLM-written script in one step\n    - Re-voice lines whose text or voice changed\n    - Produce narration assets for timeline assembly";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly metadataOutputTypes = {
    output: "script",
    voiced_count: "int"
  };
  static readonly inlineFields = ["script"];
  static readonly inputFields = ["script"];

  @prop({
    type: "script",
    default: scriptRefDefault,
    title: "Script",
    description: "The script whose lines to voice."
  })
  declare script: ScriptRef;

  @prop({
    type: "float",
    default: 1,
    title: "Speed",
    description: "Speech speed multiplier passed to the TTS provider.",
    min: 0.25,
    max: 4
  })
  declare speed: number;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    if (!context) {
      throw new Error("VoiceScript requires a processing context");
    }
    const script = await loadScript(this.script, context);
    const doc = script.document;
    const cast = doc.cast ?? [];

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-voice-script-")
    );
    let voiced = 0;
    try {
      for (const line of allLines(doc)) {
        const text = line.text.trim();
        if (!text) continue;
        const voice = effectiveVoice(line, cast);
        if (!voice) continue;
        if (!needsVoicing(line, voice)) continue;

        const synth = await synthesizeLine(context, text, voice, this.speed);
        if (!synth) continue;

        const durationMs = await probeDurationMs(
          synth.bytes,
          workDir,
          voiced
        );
        const asset = (await context.createAsset({
          name: `${script.name || "script"}-line-${voiced + 1}`,
          contentType: synth.contentType,
          content: synth.bytes
        })) as { id: string };

        const take: ScriptTakeLike = {
          id: `take_${randomUUID()}`,
          assetId: asset.id,
          durationMs,
          words: [],
          textSnapshot: line.text,
          voiceSnapshot: voice,
          createdAt: new Date().toISOString()
        };
        line.takes = [...line.takes, take];
        line.currentTakeId = take.id;
        voiced += 1;
      }
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }

    if (voiced > 0) {
      const saved = (await context.updateScript(script.id, {
        document: doc,
        baseUpdatedAt: script.updatedAt
      })) as { id: string } | null;
      if (!saved) {
        throw new Error(
          "VoiceScript: failed to save the script (it was modified concurrently)"
        );
      }
    }

    return {
      output: { type: "script", id: script.id },
      voiced_count: voiced
    };
  }
}

export class ScriptToTimelineNode extends BaseNode {
  static readonly nodeType = "nodetool.script.ScriptToTimeline";
  static readonly title = "Script To Timeline";
  static readonly description =
    "Assemble a script's current takes into a voiceover timeline — one audio clip per voiced line, laid end to end with the authored pauses, each linked back to its script line. Updates the linked timeline in place when the script already has one. Voice the script first.\n    script, timeline, voiceover, assemble, sequence\n\n    Use cases:\n    - Turn a voiced script into an editable sequence\n    - Build a narration track for a video edit\n    - Round-trip re-voiced lines into an existing timeline";
  static readonly metadataOutputTypes = {
    output: "timeline"
  };
  static readonly inlineFields = ["script"];
  static readonly inputFields = ["script"];

  @prop({
    type: "script",
    default: scriptRefDefault,
    title: "Script",
    description: "The voiced script to assemble."
  })
  declare script: ScriptRef;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    if (!context) {
      throw new Error("ScriptToTimeline requires a processing context");
    }
    const script = await loadScript(this.script, context);
    const doc = script.document;
    const cast = doc.cast ?? [];
    const name = script.name?.trim() || "Script voiceover";

    const track = makeTrack({ type: "audio", name: "Voiceover", index: 0 });
    const tracks: TimelineTrack[] = [track];
    const clips: TimelineClip[] = [];

    const speakerName = (speakerId?: string | null): string | undefined =>
      speakerId ? cast.find((s) => s.id === speakerId)?.name : undefined;

    let cursorMs = 0;
    for (const line of allLines(doc)) {
      const take = currentTake(line);
      if (!take || !take.assetId) continue;
      const durationMs =
        take.durationMs > 0 ? take.durationMs : PLACEHOLDER_LINE_MS;
      clips.push(
        makeClip({
          trackId: track.id,
          name: line.text.slice(0, 40) || "Line",
          startMs: cursorMs,
          durationMs,
          mediaType: "audio",
          sourceType: "imported",
          bindingKind: "text-to-audio",
          status: "generated",
          currentAssetId: take.assetId,
          prompt: line.text,
          voice: effectiveVoice(line, cast)?.voice,
          speaker: speakerName(line.speakerId),
          caption: take.words.length ? { words: take.words } : undefined,
          scriptId: script.id,
          scriptLineId: line.id,
          versions: []
        })
      );
      cursorMs += durationMs + Math.max(0, line.pauseAfterMs ?? 0);
    }

    if (clips.length === 0) {
      throw new Error(
        "ScriptToTimeline: no voiced lines to assemble — voice the script first"
      );
    }

    const existingId = script.timelineId;
    let seq: TimelineSequence;
    if (existingId) {
      // Re-assemble: replace this script's voiceover track/clips, keep any
      // other tracks and clips the editor added.
      const existing = (await context.getTimelineSequence(
        existingId
      )) as TimelineSequence | null;
      if (!existing) {
        throw new Error(`Linked timeline not found: ${existingId}`);
      }
      const foreignClips = existing.clips.filter(
        (c) => c.scriptId !== script.id
      );
      const thisScriptTrackIds = new Set(
        existing.clips
          .filter((c) => c.scriptId === script.id)
          .map((c) => c.trackId)
      );
      const foreignTrackIds = new Set(foreignClips.map((c) => c.trackId));
      const foreignTracks = existing.tracks.filter(
        (t) => foreignTrackIds.has(t.id) || !thisScriptTrackIds.has(t.id)
      );
      seq = {
        ...existing,
        tracks: [...tracks, ...foreignTracks],
        clips: [...clips, ...foreignClips]
      };
      seq.durationMs = seq.clips.reduce(
        (end, c) => Math.max(end, c.startMs + c.durationMs),
        0
      );
      const saved = (await context.updateTimelineSequence(existingId, seq)) as {
        id: string;
      } | null;
      if (!saved) {
        throw new Error("ScriptToTimeline: failed to update the linked timeline");
      }
      return { output: { type: "timeline", id: saved.id } };
    }

    seq = makeSequence({ name, projectId: script.projectId, tracks, clips });
    seq.durationMs = cursorMs;
    const saved = (await context.createTimelineSequence(seq)) as {
      id: string;
    } | null;
    if (!saved) {
      throw new Error("ScriptToTimeline: failed to create the timeline");
    }
    // Link the script to the new sequence (best-effort — a CAS miss doesn't
    // invalidate the timeline we just wrote).
    try {
      await context.updateScript(script.id, { timelineId: saved.id });
    } catch (error) {
      console.warn("ScriptToTimeline: failed to link script to timeline", error);
    }
    return { output: { type: "timeline", id: saved.id } };
  }
}

export class ScriptToSubtitlesNode extends BaseNode {
  static readonly nodeType = "nodetool.script.ScriptToSubtitles";
  static readonly title = "Script To Subtitles";
  static readonly description =
    "Export a voiced script as SRT or WebVTT subtitles, straight from each current take's word timings — one cue per line (or per word), laid out end to end with the authored pauses. Voice the script first; unvoiced lines are skipped.\n    script, subtitles, srt, vtt, captions, export\n\n    Use cases:\n    - Produce a subtitle sidecar for a voiced narration\n    - Generate word-timed captions from take timings\n    - Feed subtitles into a burn-in or upload step";
  static readonly metadataOutputTypes = {
    subtitles: "str",
    cue_count: "int"
  };
  static readonly inlineFields = ["script", "format", "granularity"];
  static readonly inputFields = ["script"];

  @prop({
    type: "script",
    default: scriptRefDefault,
    title: "Script",
    description: "The voiced script to export subtitles from."
  })
  declare script: ScriptRef;

  @prop({
    type: "enum",
    default: "srt",
    title: "Format",
    description: "Subtitle format: SubRip (.srt) or WebVTT (.vtt).",
    values: ["srt", "vtt"]
  })
  declare format: SubtitleFormat;

  @prop({
    type: "enum",
    default: "line",
    title: "Granularity",
    description:
      "One cue per line (whole line text) or per word (using take word timings).",
    values: ["line", "word"]
  })
  declare granularity: SubtitleGranularity;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const script = await loadScript(this.script, context);
    const doc = script.document;

    const entries: SubtitleEntry[] = [];
    for (const line of allLines(doc)) {
      const take = currentTake(line);
      if (!take || !take.assetId) continue;
      const text = line.text.trim();
      if (!text) continue;
      entries.push({
        text: line.text,
        durationMs: take.durationMs > 0 ? take.durationMs : PLACEHOLDER_LINE_MS,
        words: take.words,
        pauseAfterMs: line.pauseAfterMs
      });
    }

    if (entries.length === 0) {
      throw new Error(
        "ScriptToSubtitles: no voiced lines to export — voice the script first"
      );
    }

    const cues = assembleSubtitleCues(entries, {
      granularity: this.granularity
    });
    return {
      subtitles: formatSubtitles(cues, this.format),
      cue_count: cues.length
    };
  }
}

// ── TTS helpers (mirror audio TextToSpeechNode's provider routing) ──

interface SynthResult {
  bytes: Uint8Array;
  contentType: string;
}

async function synthesizeLine(
  context: ProcessingContext,
  text: string,
  voice: VoiceBindingLike,
  speed: number
): Promise<SynthResult | null> {
  const provider = voice.provider;
  const model = voice.model;
  if (!provider || !model) return null;
  const params = { text, voice: voice.voice, speed };

  // Providers that stream raw PCM (OpenAI, ElevenLabs…) are wrapped into a WAV.
  // Providers that return an encoded audio file (FAL, KIE) go through the
  // encoded path.
  if (await context.providerSupportsStreamingTTS(provider)) {
    const chunks: Uint8Array[] = [];
    let sampleRate = 24000;
    for await (const item of context.streamProviderPrediction({
      provider,
      capability: "text_to_speech",
      model,
      params
    })) {
      const piece = item as { samples?: Int16Array; sampleRate?: number };
      if (typeof piece.sampleRate === "number" && piece.sampleRate > 0) {
        sampleRate = piece.sampleRate;
      }
      if (piece.samples instanceof Int16Array) {
        chunks.push(
          new Uint8Array(
            piece.samples.buffer.slice(
              piece.samples.byteOffset,
              piece.samples.byteOffset + piece.samples.byteLength
            )
          )
        );
      }
    }
    const wav = encodePcm16Wav(concatBytes(chunks), sampleRate, 1);
    if (wav.length === 0) return null;
    return { bytes: wav, contentType: "audio/wav" };
  }

  const encoded = await context.textToSpeechEncoded({
    provider,
    capability: "text_to_speech",
    model,
    params
  });
  if (!encoded?.data || encoded.data.length === 0) return null;
  return {
    bytes: encoded.data,
    contentType:
      typeof encoded.mimeType === "string" ? encoded.mimeType : "audio/mpeg"
  };
}

async function probeDurationMs(
  bytes: Uint8Array,
  workDir: string,
  index: number
): Promise<number> {
  const probePath = path.join(workDir, `line_${index}`);
  try {
    await fs.writeFile(probePath, bytes);
    const seconds = await ffprobeDuration(probePath);
    return seconds > 0 ? Math.round(seconds * 1000) : PLACEHOLDER_LINE_MS;
  } catch {
    return PLACEHOLDER_LINE_MS;
  }
}

export const SCRIPT_NODES = tagAsNode([
  LoadScriptNode,
  VoiceScriptNode,
  ScriptToTimelineNode,
  ScriptToSubtitlesNode
]);
