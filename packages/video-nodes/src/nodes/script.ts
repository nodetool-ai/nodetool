/**
 * Script nodes — operate on persisted scripts (the script editor's documents)
 * referenced by the `script` type. A script owns its text; audio is derived.
 *
 * - LoadScript reads a script's text and metadata for downstream LLM/text nodes.
 * - VoiceScript batch-synthesizes every draft/stale line with its cast voice,
 *   appending a take per line and persisting the script.
 * - ScriptToTimeline assembles the current takes into a voiceover sequence,
 *   the headless mirror of the editor's "Send to timeline".
 * - WriteScript writes a new script from a brief through the same authoring
 *   rules the script surface and the `write_script` capability use.
 * - FillScript derives a new script from a template by filling its `{{key}}`
 *   placeholders. Both create a row; neither writes the script it read.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { Entity, LanguageModel, ScriptRef } from "@nodetool-ai/protocol";
import {
  SCRIPT_TOOL_DESCRIPTION,
  SCRIPT_TOOL_NAME,
  SCRIPT_WRITER_SYSTEM_PROMPT,
  buildScriptSchema,
  buildScriptWriterPrompt,
  fallbackScript,
  fillScript,
  parseWrittenScript,
  type ScriptPaceId,
  type ScriptWriterInput,
  type WrittenScript
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { generateStructured, resolveEntities } from "@nodetool-ai/runtime";
import { concatBytes, encodePcm16Wav } from "@nodetool-ai/audio-nodes";
import {
  assembleSubtitleCues,
  buildScriptTimeline,
  currentTake,
  effectiveVoice,
  formatSubtitles,
  makeSequence,
  needsVoicing,
  scriptLines,
  PLACEHOLDER_LINE_MS,
  type SubtitleEntry,
  type SubtitleFormat,
  type SubtitleGranularity,
  type TimelineSequence
} from "@nodetool-ai/timeline";
import type {
  ScriptLine,
  ScriptSection,
  Speaker,
  Take,
  VoiceBinding
} from "@nodetool-ai/protocol/api-schemas/scripts.js";
import { tagAsNode, tagAsServer } from "@nodetool-ai/nodes-utils";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ffprobeDuration } from "./ffmpeg-helpers.js";
import { stringValues } from "./placeholder-values.js";
import {
  isPositiveNumber,
  isString
} from "@nodetool-ai/node-sdk";

const scriptRefDefault = { type: "script", id: null, data: null } as const;

// ── Script document shapes (structurally match @nodetool-ai/models Script) ──

type VoiceBindingLike = VoiceBinding;
type ScriptTakeLike = Take;
type ScriptLineLike = ScriptLine;
type ScriptSpeakerLike = Speaker;
type ScriptDocumentLike = { cast: Speaker[]; sections: ScriptSection[] };

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
  scriptLines(doc.sections);

// ── Nodes ────────────────────────────────────────────────────────────────────

/** Output handles LoadScriptNode.process() emits. */
type LoadScriptNodeOutputs = {
  text: string;
  lines: string[];
  name: string;
  line_count: number;
};

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
  ): Promise<LoadScriptNodeOutputs> {
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

/** Output handles VoiceScriptNode.process() emits. */
type VoiceScriptNodeOutputs = {
  output: { type: string; id: string };
  voiced_count: number;
};

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
  ): Promise<VoiceScriptNodeOutputs> {
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

/** Output handles ScriptToTimelineNode.process() emits. */
type ScriptToTimelineNodeOutputs = {
  output: { type: string; id: string };
};

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
  ): Promise<ScriptToTimelineNodeOutputs> {
    if (!context) {
      throw new Error("ScriptToTimeline requires a processing context");
    }
    const script = await loadScript(this.script, context);
    const doc = script.document;
    const name = script.name?.trim() || "Script voiceover";

    // Same mapping the editor's "Send to timeline" and the headless
    // assemble_script_timeline tool use.
    const { tracks, clips, durationMs: cursorMs } = buildScriptTimeline({
      scriptId: script.id,
      cast: doc.cast ?? [],
      sections: doc.sections
    });

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

/** Output handles ScriptToSubtitlesNode.process() emits. */
type ScriptToSubtitlesNodeOutputs = {
  subtitles: string;
  cue_count: number;
};

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
  ): Promise<ScriptToSubtitlesNodeOutputs> {
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

// ── Template derivations (design docs/graph-resources/design.md § 4.3) ──

const EMPTY_LANGUAGE_MODEL = {
  type: "language_model",
  provider: "empty",
  id: "",
  name: "",
  path: null,
  supported_tasks: []
} as const;

/** Tokens the writer is allowed for one script — the capability's own cap. */
const MAX_WRITER_TOKENS = 8192;

/** Length the writer aims at when a graph does not say. The middle choice. */
const DEFAULT_SCRIPT_SECONDS = 60;

/** Output handles WriteScriptNode.process() emits. */
type WriteScriptNodeOutputs = {
  script: { type: string; id: string };
  line_count: number;
};

/**
 * The brief the writer reads: the graph's brief, plus the cast a graph handed
 * in. Without the names the model invents its own, and no speaker could be
 * bound to the entity that is meant to voice it.
 */
function briefWithCast(brief: string, cast: Entity[]): string {
  if (cast.length === 0) return brief;
  const roster = cast
    .map((entity) =>
      entity.descriptor.trim()
        ? `${entity.name} — ${entity.descriptor.trim()}`
        : entity.name
    )
    .join("; ");
  return `${brief.trim()}\n\nCast: ${roster}. Use these names for the speakers.`;
}

/**
 * Bind each written speaker to a cast entity: by name where the writer used
 * one, then positionally for whatever is left over. A format's speaker is
 * "Narrator" whatever the entity is called, so a name-only rule would leave the
 * one narrator of a voiceover script unvoiced.
 */
function bindCastToSpeakers(
  written: WrittenScript,
  cast: Entity[],
  voice: { provider: string; model: string }
): ScriptSpeakerLike[] {
  const byName = new Map(
    cast.map((entity) => [entity.name.trim().toLowerCase(), entity])
  );
  const taken = new Set<string>();
  const bound = written.cast.map((speaker) => {
    const match = byName.get(speaker.name.trim().toLowerCase());
    if (match && !taken.has(match.id)) {
      taken.add(match.id);
      return { speaker, entity: match };
    }
    return { speaker, entity: null as Entity | null };
  });
  const spare = cast.filter((entity) => !taken.has(entity.id));
  for (const entry of bound) {
    if (entry.entity || spare.length === 0) continue;
    entry.entity = spare.shift() ?? null;
  }

  return bound.map(({ speaker, entity }) => {
    const member: ScriptSpeakerLike = { id: speaker.id, name: speaker.name };
    if (!entity) return member;
    member.entityId = entity.id;
    // A binding is provider, model and voice together or nothing at all —
    // half a binding would look voiceable and synthesize silence.
    const voiceId = entity.voice_id ?? "";
    if (voiceId && voice.provider && voice.model) {
      member.voice = { ...voice, voice: voiceId };
    }
    return member;
  });
}

export class WriteScriptNode extends BaseNode {
  static readonly nodeType = "nodetool.script.WriteScript";
  static readonly title = "Write Script";
  static readonly description =
    "Write a new script from a brief, using the same writer rules the script editor and the agent use, and save it as a new script. Cast entities become speakers, each carrying its entity link and its voice.\n    script, write, brief, narration, cast\n\n    Use cases:\n    - Turn a per-row brief into a script inside a batch\n    - Write one script per language from the same brief\n    - Author narration for a board without opening the editor";
  static readonly metadataOutputTypes = {
    script: "script",
    line_count: "int"
  };
  static readonly inlineFields = ["brief", "format", "language", "pace"];
  static readonly inputFields = ["brief", "cast"];

  @prop({
    type: "language_model",
    default: EMPTY_LANGUAGE_MODEL,
    title: "Model",
    description: "Model that writes the script."
  })
  declare model: LanguageModel;

  @prop({
    type: "str",
    default: "",
    title: "Brief",
    description: "What the script is about."
  })
  declare brief: string;

  @prop({
    type: "enum",
    default: "voiceover",
    title: "Format",
    description: "Which format's cast and sections the writer works to.",
    values: ["voiceover", "dialogue", "interview", "ad-read", "tutorial"]
  })
  declare format: string;

  @prop({
    type: "list[entity]",
    default: [],
    title: "Cast",
    description:
      "Entities that speak. Each becomes a speaker linked to the entity, voiced with its voice id."
  })
  declare cast: Entity[];

  @prop({
    type: "str",
    default: "",
    title: "Language",
    description: "Language to write in. Empty writes in the brief's language."
  })
  declare language: string;

  @prop({
    type: "enum",
    default: "normal",
    title: "Pace",
    description: "Reading pace the length target is computed at.",
    values: ["slow", "normal", "fast"]
  })
  declare pace: ScriptPaceId;

  @prop({
    type: "int",
    default: DEFAULT_SCRIPT_SECONDS,
    title: "Length Seconds",
    description: "How long the finished read should take.",
    min: 5,
    max: 1800
  })
  declare length_seconds: number;

  @prop({
    type: "str",
    default: "",
    title: "Voice Provider",
    description:
      "TTS provider for the cast's voices. Needed with Voice Model for a speaker's voice id to be voiceable."
  })
  declare voice_provider: string;

  @prop({
    type: "str",
    default: "",
    title: "Voice Model",
    description: "TTS model for the cast's voices."
  })
  declare voice_model: string;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Name for the new script. Defaults to the brief's first words."
  })
  declare name: string;

  async process(
    context?: ProcessingContext
  ): Promise<WriteScriptNodeOutputs> {
    if (!context) {
      throw new Error("WriteScript requires a processing context");
    }
    const brief = this.brief?.trim() ?? "";
    if (!brief) {
      throw new Error("WriteScript: brief is empty — there is nothing to write");
    }
    const providerId = this.model?.provider ?? "";
    const modelId = this.model?.id ?? "";
    if (!providerId || !modelId) {
      throw new Error(
        "WriteScript: pick a model — the writer needs a provider and a model id"
      );
    }

    const cast = await resolveEntities(this.cast, context);
    const input: ScriptWriterInput = {
      brief: briefWithCast(brief, cast),
      format: this.format ?? "",
      lengthSeconds: Number(this.length_seconds) || DEFAULT_SCRIPT_SECONDS,
      pace: this.pace
    };
    if (this.language?.trim()) {
      input.language = this.language.trim();
    }

    const provider = await context.getProvider(providerId);
    const answer = await generateStructured(provider, {
      model: modelId,
      maxTokens: MAX_WRITER_TOKENS,
      messages: [
        { role: "system", content: SCRIPT_WRITER_SYSTEM_PROMPT },
        { role: "user", content: buildScriptWriterPrompt(input) }
      ],
      toolName: SCRIPT_TOOL_NAME,
      toolDescription: SCRIPT_TOOL_DESCRIPTION,
      schema: buildScriptSchema()
    });

    const parseOptions = { idPrefix: `w${Date.now().toString(36)}` };
    const parsed = parseWrittenScript(answer, parseOptions);
    // A provider with no tool support — the fake one included — falls back to
    // the brief split into lines, the rule the writer capability applies too.
    const written =
      parsed.sections.length > 0 ? parsed : fallbackScript(input, parseOptions);

    const document: ScriptDocumentLike = {
      cast: bindCastToSpeakers(written, cast, {
        provider: this.voice_provider?.trim() ?? "",
        model: this.voice_model?.trim() ?? ""
      }),
      sections: written.sections.map((section) => ({
        id: section.id,
        title: section.title,
        lines: section.lines.map((line) => ({
          id: line.id,
          speakerId: line.speakerId,
          text: line.text,
          ...(line.direction === undefined ? {} : { direction: line.direction }),
          takes: []
        }))
      }))
    };

    const saved = (await context.createScript({
      name: this.name?.trim() || defaultScriptName(brief),
      document
    })) as { id: string } | null;
    if (!saved) {
      throw new Error("WriteScript: failed to create the script");
    }
    return {
      script: { type: "script", id: saved.id },
      line_count: allLines(document).length
    };
  }
}

/** A script name from the brief's first words, when the graph gave none. */
function defaultScriptName(brief: string): string {
  const words = brief.trim().split(/\s+/).slice(0, 8).join(" ");
  return words.length > 0 ? words.slice(0, 80) : "Untitled script";
}

/** Output handles FillScriptNode.process() emits. */
type FillScriptNodeOutputs = {
  script: { type: string; id: string };
  filled: string[];
  unresolved: string[];
};

export class FillScriptNode extends BaseNode {
  static readonly nodeType = "nodetool.script.FillScript";
  static readonly title = "Fill Script";
  static readonly description =
    "Fill a template script's {{key}} placeholders from a value bag and save the result as a new script. The template is never written. A key with no value stays in the text and is reported, and every take is kept, so a later Voice Script pays only for the lines whose text moved.\n    script, template, fill, placeholder, batch\n\n    Use cases:\n    - Produce one script per row of a product feed\n    - Localize a template by swapping its values\n    - Re-run a batch and re-voice only what changed";
  static readonly metadataOutputTypes = {
    script: "script",
    filled: "list[str]",
    unresolved: "list[str]"
  };
  static readonly inlineFields = ["script"];
  static readonly inputFields = ["script", "values"];

  @prop({
    type: "script",
    default: scriptRefDefault,
    title: "Script",
    description: "The template script to fill."
  })
  declare script: ScriptRef;

  @prop({
    type: "dict",
    default: {},
    title: "Values",
    description: "Value per placeholder key, e.g. {name: \"Aero 9\"}."
  })
  declare values: Record<string, unknown>;

  @prop({
    type: "str",
    default: "",
    title: "Name",
    description: "Name for the new script. Defaults to the template's name."
  })
  declare name: string;

  async process(
    context?: ProcessingContext
  ): Promise<FillScriptNodeOutputs> {
    if (!context) {
      throw new Error("FillScript requires a processing context");
    }
    const script = await loadScript(this.script, context);
    const result = fillScript(script.document, stringValues(this.values));

    const saved = (await context.createScript({
      name: this.name?.trim() || script.name,
      projectId: script.projectId,
      document: { ...result.document, templateId: script.id }
    })) as { id: string } | null;
    if (!saved) {
      throw new Error("FillScript: failed to create the filled script");
    }
    return {
      script: { type: "script", id: saved.id },
      filled: result.filled,
      unresolved: result.unresolved
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
      if (isPositiveNumber(piece.sampleRate)) {
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
      isString(encoded.mimeType) ? encoded.mimeType : "audio/mpeg"
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
  ScriptToSubtitlesNode,
  // Tagged first, so `tagAsNode` leaves them alone: neither node shells out to
  // ffmpeg or writes a temp file, and both need the model interfaces.
  ...tagAsServer([WriteScriptNode, FillScriptNode])
]);
