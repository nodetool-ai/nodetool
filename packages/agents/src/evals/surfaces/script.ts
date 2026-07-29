/**
 * Headless bridge for the Script surface tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/script.ts`) delegate to
 * a live `ScriptAgentHandler` registered by an open `ScriptSurface` — reading
 * and mutating a zustand-backed script document, and driving real TTS. None of
 * that can run under Node. This bridge reimplements the *effects* of those ten
 * `ui_script_*` tools against a plain in-memory script, so a model can drive
 * the exact same tool surface headlessly.
 *
 * Unlike the graph-editor bridge (which targets an explicit node graph the
 * model names by id), the headless script bridge targets a single implicit
 * script — there is no multi-document registry, so every tool drops the real
 * tools' `script_id` parameter. Tool names, descriptions, and the remaining
 * Zod parameter shapes are copied verbatim from the frontend builtins; this is
 * the one intentional fork (documented, not silent).
 *
 * Voicing is simulated: a take's duration is derived from word count
 * (~350ms/word, 500ms floor) and its word timings are spaced evenly across
 * that duration — deterministic, no network calls. Subtitle export reuses the
 * real pure `@nodetool-ai/timeline` subtitle assembly so the eval exercises
 * the same code path as the browser and the script-graph nodes.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  assembleSubtitleCues,
  formatSubtitles,
  type SubtitleEntry,
  type SubtitleFormat,
  type SubtitleGranularity
} from "@nodetool-ai/timeline";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase,
  ToolLoopStatePredicate
} from "../tool-loop-eval.js";

/** A TTS provider/model/voice selection, mirroring `VoiceBinding`. */
export interface ScriptVoiceBinding {
  provider: string;
  model: string;
  voice: string;
  settings?: Record<string, unknown>;
}

type ScriptLineStatus = "draft" | "voiced" | "stale";

/** A word timed relative to the take it belongs to. */
interface ScriptTakeWord {
  word: string;
  startMs: number;
  endMs: number;
}

/** A recorded voicing of a line. */
interface ScriptTake {
  durationMs: number;
  words: ScriptTakeWord[];
}

/** Internal mutable representation of one cast member. */
interface InternalSpeaker {
  id: string;
  name: string;
  voice: ScriptVoiceBinding | null;
}

/** Internal mutable representation of one script line. */
interface InternalLine {
  id: string;
  speakerId: string | null;
  text: string;
  direction?: string;
  pauseAfterMs?: number;
  status: ScriptLineStatus;
  takeCount: number;
  currentTake: ScriptTake | null;
}

/** Case-supplied starting point for a run. */
export interface ScriptBridgeInitialState {
  title?: string;
  cast?: Array<{ id?: string; name: string; voice?: ScriptVoiceBinding }>;
  lines?: Array<{
    id?: string;
    text: string;
    speakerId?: string;
    direction?: string;
    pauseAfterMs?: number;
  }>;
}

/** Snapshot handed to a case's final-state predicates. */
export interface ScriptBridgeFinalState {
  title: string;
  hasTimeline: boolean;
  cast: { id: string; name: string; hasVoice: boolean }[];
  lines: {
    id: string;
    index: number;
    speakerId: string | null;
    text: string;
    status: "draft" | "voiced" | "stale";
    takeCount: number;
  }[];
}

const MIN_TAKE_DURATION_MS = 500;
const MS_PER_WORD = 350;

function tool(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<unknown>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: async (args) =>
      impl(parseWithTypeCoercion(parameters, args ?? {}) as Record<
        string,
        unknown
      >)
  };
}

const lineTargetParam = z
  .string()
  .describe(
    "Line id or its 0-based index across the whole script (as a string)."
  );

const voiceParam = z
  .object({
    provider: z
      .string()
      .describe("TTS provider id, e.g. 'elevenlabs', 'openai'."),
    model: z.string().describe("TTS model id for the provider."),
    voice: z.string().describe("Voice id/name within the provider/model."),
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Provider-specific synthesis knobs (stability, speed, …).")
  })
  .describe("A provider/model/voice selection the cast member speaks with.");

/**
 * Build an in-memory bridge whose tools share the frontend `ui_script_*`
 * contract (minus `script_id`) but run headlessly against a single implicit
 * script document.
 */
/** Highest numeric suffix among ids shaped `<prefix><n>` (0 when none). */
function maxIdSuffix(ids: string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

export function createScriptToolBridge(
  initial: ScriptBridgeInitialState = {}
): HeadlessSurfaceBridge<ScriptBridgeFinalState> {
  const title = initial.title ?? "Untitled Script";
  let hasTimeline = false;
  let timelineId: string | null = null;

  let speakerSeq = 0;
  let lineSeq = 0;
  let takeSeq = 0;
  let sequenceSeq = 0;

  const cast: InternalSpeaker[] = (initial.cast ?? []).map((s) => ({
    id: s.id ?? `spk_${++speakerSeq}`,
    name: s.name,
    voice: s.voice ?? null
  }));
  // Keep the counter ahead of any explicit ids supplied above — track the
  // highest `spk_<n>` suffix, not just the count, so auto ids can't collide
  // with an explicit id like `spk_10` on a single-member cast.
  speakerSeq = Math.max(speakerSeq, maxIdSuffix(cast.map((s) => s.id), "spk_"));

  const lines: InternalLine[] = (initial.lines ?? []).map((l) => ({
    id: l.id ?? `line_${++lineSeq}`,
    speakerId: l.speakerId ?? null,
    text: l.text,
    direction: l.direction,
    pauseAfterMs: l.pauseAfterMs,
    status: "draft",
    takeCount: 0,
    currentTake: null
  }));
  lineSeq = Math.max(lineSeq, maxIdSuffix(lines.map((l) => l.id), "line_"));

  const findSpeaker = (id: string): InternalSpeaker | undefined =>
    cast.find((s) => s.id === id);

  /** A line's effective voice: its assigned speaker's voice, if any. */
  const effectiveVoice = (line: InternalLine): ScriptVoiceBinding | null => {
    if (!line.speakerId) return null;
    return findSpeaker(line.speakerId)?.voice ?? null;
  };

  /** Resolve a `target` string (line id or 0-based index) to a line. */
  const resolveLine = (target: string): InternalLine => {
    const byId = lines.find((l) => l.id === target);
    if (byId) return byId;
    const index = Number(target);
    if (Number.isInteger(index) && index >= 0 && index < lines.length) {
      return lines[index];
    }
    throw new Error(
      `No line found for target "${target}" (expected a line id or a 0-based index between 0 and ${lines.length - 1}).`
    );
  };

  const speakerNode = (s: InternalSpeaker) => ({
    id: s.id,
    name: s.name,
    voice: s.voice
  });

  const lineNode = (l: InternalLine) => ({
    id: l.id,
    index: lines.indexOf(l),
    speakerId: l.speakerId,
    speakerName: l.speakerId ? (findSpeaker(l.speakerId)?.name ?? null) : null,
    text: l.text,
    direction: l.direction,
    pauseAfterMs: l.pauseAfterMs,
    status: l.status,
    takeCount: l.takeCount,
    currentTakeDurationMs: l.currentTake?.durationMs ?? null
  });

  const voiceOneLine = (line: InternalLine): void => {
    const text = line.text.trim();
    if (!text) {
      throw new Error(`Line "${line.id}" has no text to voice.`);
    }
    if (!effectiveVoice(line)) {
      throw new Error(
        `Line "${line.id}" has no effective voice (assign a speaker with a bound voice, or set one with ui_script_set_speaker_voice).`
      );
    }
    const words = text.split(/\s+/).filter(Boolean);
    const durationMs = Math.max(
      MIN_TAKE_DURATION_MS,
      words.length * MS_PER_WORD
    );
    const perWordMs = words.length > 0 ? durationMs / words.length : 0;
    const timedWords: ScriptTakeWord[] = words.map((word, i) => ({
      word,
      startMs: Math.round(i * perWordMs),
      endMs: Math.round((i + 1) * perWordMs)
    }));
    line.currentTake = { durationMs, words: timedWords };
    line.status = "voiced";
    line.takeCount += 1;
    takeSeq += 1;
  };

  const canVoice = (line: InternalLine): boolean =>
    line.text.trim().length > 0 && effectiveVoice(line) !== null;

  const tools: HeadlessTool[] = [
    tool(
      "ui_script_get_state",
      "Read the specified script: title, whether it has been assembled into a timeline, the cast (each speaker's id, name, and voice binding), and every line in document order with its id, index, section, speaker, text, direction, voicing status (draft/voiced/stale), take count, and current-take duration. Call this first to discover the line/speaker ids the other tools need.",
      z.object({}),
      async () => ({
        ok: true,
        title,
        hasTimeline,
        timelineId,
        cast: cast.map(speakerNode),
        lines: lines.map(lineNode)
      })
    ),

    tool(
      "ui_script_add_speaker",
      "Add a cast member (speaker). `name` is required; optionally bind a `voice` (provider/model/voice) the speaker is voiced with. Lines assigned to this speaker inherit its voice. Returns the created speaker with its id.",
      z.object({ name: z.string(), voice: voiceParam.optional() }),
      async ({ name, voice }) => {
        const speaker: InternalSpeaker = {
          id: `spk_${++speakerSeq}`,
          name: name as string,
          voice: (voice as ScriptVoiceBinding | undefined) ?? null
        };
        cast.push(speaker);
        return { ok: true, speaker: speakerNode(speaker) };
      }
    ),

    tool(
      "ui_script_set_speaker_voice",
      "Set (or replace) the TTS voice bound to a cast member, given its `speakerId` and a `voice` (provider/model/voice). Lines that use this speaker's voice become stale until re-voiced.",
      z.object({ speakerId: z.string(), voice: voiceParam }),
      async ({ speakerId, voice }) => {
        const speaker = findSpeaker(speakerId as string);
        if (!speaker) {
          throw new Error(`No speaker found for id "${String(speakerId)}".`);
        }
        speaker.voice = voice as ScriptVoiceBinding;
        for (const line of lines) {
          if (line.speakerId === speaker.id && line.status === "voiced") {
            line.status = "stale";
          }
        }
        return { ok: true, speaker: speakerNode(speaker) };
      }
    ),

    tool(
      "ui_script_add_line",
      "Add a line to the specified script. `text` is the spoken content (required). Optionally assign a `speakerId` (the line inherits that speaker's voice), a `direction` (a free-form performance note like 'whispering, tired'), and an `index` to insert at (0-based across the document; appended when omitted). The line starts unvoiced.",
      z.object({
        text: z.string(),
        speakerId: z.string().optional(),
        direction: z.string().optional(),
        index: z.number().optional()
      }),
      async ({ text, speakerId, direction, index }) => {
        if (speakerId !== undefined && !findSpeaker(speakerId as string)) {
          throw new Error(`No speaker found for id "${String(speakerId)}".`);
        }
        const line: InternalLine = {
          id: `line_${++lineSeq}`,
          speakerId: (speakerId as string | undefined) ?? null,
          text: text as string,
          direction: direction as string | undefined,
          status: "draft",
          takeCount: 0,
          currentTake: null
        };
        const insertAt =
          typeof index === "number"
            ? Math.max(0, Math.min(index, lines.length))
            : lines.length;
        lines.splice(insertAt, 0, line);
        return { ok: true, line: lineNode(line) };
      }
    ),

    tool(
      "ui_script_set_line_text",
      "Replace a line's spoken text. If the line was voiced, this makes its current take stale (re-voice it with ui_script_voice_line).",
      z.object({ target: lineTargetParam, text: z.string() }),
      async ({ target, text }) => {
        const line = resolveLine(target as string);
        line.text = text as string;
        if (line.status === "voiced") {
          line.status = "stale";
        }
        return { ok: true, line: lineNode(line) };
      }
    ),

    tool(
      "ui_script_set_speaker",
      "Assign (or clear, with null) the speaker of a line. The line then inherits that speaker's voice. Pass null to unassign the speaker.",
      z.object({ target: lineTargetParam, speakerId: z.string().nullable() }),
      async ({ target, speakerId }) => {
        const line = resolveLine(target as string);
        if (speakerId !== null && !findSpeaker(speakerId as string)) {
          throw new Error(`No speaker found for id "${String(speakerId)}".`);
        }
        const previousSpeakerId = line.speakerId;
        line.speakerId = speakerId as string | null;
        // Reassigning the speaker changes the line's effective voice, so a
        // voiced take no longer matches — mark it stale until re-voiced.
        if (line.status === "voiced" && previousSpeakerId !== line.speakerId) {
          line.status = "stale";
        }
        return { ok: true, line: lineNode(line) };
      }
    ),

    tool(
      "ui_script_voice_line",
      "Voice a single line into a new take (TTS with the line's effective voice), setting it as the current take. The line must have text and an effective voice (its own override or its speaker's). Returns the updated line; the take's word timings arrive best-effort.",
      z.object({ target: lineTargetParam }),
      async ({ target }) => {
        const line = resolveLine(target as string);
        voiceOneLine(line);
        return { ok: true, line: lineNode(line) };
      }
    ),

    tool(
      "ui_script_voice_all",
      "Voice every draft or stale line in the specified script (bounded concurrency), respecting each line's effective voice. Lines already up to date, or with no text or no voice, are skipped. Returns the number of lines voiced.",
      z.object({}),
      async () => {
        let voiced = 0;
        for (const line of lines) {
          if (line.status === "voiced") continue;
          if (!canVoice(line)) continue;
          voiceOneLine(line);
          voiced += 1;
        }
        return { ok: true, voiced };
      }
    ),

    tool(
      "ui_script_export_subtitles",
      "Export the specified script's current takes as SRT or WebVTT subtitles, straight from the take word timings — one cue per line (default) or per word, laid out end to end with the authored pauses. Unvoiced lines are skipped; voice at least one line first. Returns the subtitle file text and cue count.",
      z.object({
        format: z
          .enum(["srt", "vtt"])
          .optional()
          .describe("Subtitle format: SubRip (srt, default) or WebVTT (vtt)."),
        granularity: z
          .enum(["line", "word"])
          .optional()
          .describe(
            "One cue per line (default) or per word (using take word timings)."
          )
      }),
      async ({ format, granularity }) => {
        const voicedLines = lines.filter((l) => l.currentTake !== null);
        if (voicedLines.length === 0) {
          throw new Error(
            "No line is voiced. Voice at least one line before exporting subtitles."
          );
        }
        const entries: SubtitleEntry[] = voicedLines.map((l) => ({
          text: l.text,
          durationMs: l.currentTake!.durationMs,
          words: l.currentTake!.words,
          pauseAfterMs: l.pauseAfterMs
        }));
        const resolvedFormat = (format as SubtitleFormat | undefined) ?? "srt";
        const cues = assembleSubtitleCues(entries, {
          granularity: granularity as SubtitleGranularity | undefined
        });
        const text = formatSubtitles(cues, resolvedFormat);
        return {
          ok: true,
          text,
          format: resolvedFormat,
          cueCount: cues.length
        };
      }
    ),

    tool(
      "ui_script_send_to_timeline",
      "Assemble the specified script's current takes into a persisted timeline sequence and open it in the timeline editor — one voiceover clip per voiced line, laid end to end with the authored pauses. Lines without a current take are skipped (returned in skippedLineIds). If the script is already linked to a timeline, its voiceover track is rewritten in place (reassembled). Voice at least one line first.",
      z.object({}),
      async () => {
        const voicedLines = lines.filter((l) => l.currentTake !== null);
        if (voicedLines.length === 0) {
          throw new Error(
            "No line is voiced. Voice at least one line before sending to the timeline."
          );
        }
        const reassembled = hasTimeline;
        if (!hasTimeline) {
          timelineId = `seq_${++sequenceSeq}`;
          hasTimeline = true;
        }
        const skippedLineIds = lines
          .filter((l) => l.currentTake === null)
          .map((l) => l.id);
        return {
          ok: true,
          sequenceId: timelineId,
          clipCount: voicedLines.length,
          skippedLineIds,
          reassembled
        };
      }
    )
  ];

  return {
    tools,
    finalState: (): ScriptBridgeFinalState => ({
      title,
      hasTimeline,
      cast: cast.map((s) => ({
        id: s.id,
        name: s.name,
        hasVoice: s.voice !== null
      })),
      lines: lines.map((l) => ({
        id: l.id,
        index: lines.indexOf(l),
        speakerId: l.speakerId,
        text: l.text,
        status: l.status,
        takeCount: l.takeCount
      }))
    })
  };
}

const SCRIPT_SYSTEM_PROMPT = `You are a scriptwriting assistant operating a Script surface through UI tools.

The script is a sequence of lines, each optionally assigned to a cast member (speaker) who may have a bound TTS voice.

- Call ui_script_get_state first to see the current title, cast, and lines.
- Add cast members with ui_script_add_speaker, and lines with ui_script_add_line.
- Assign or change a line's speaker with ui_script_set_speaker; edit its text with ui_script_set_line_text.
- Voice a single line with ui_script_voice_line, or every unvoiced/stale line at once with ui_script_voice_all — a line needs text and an effective voice (from its speaker) before it can be voiced.
- Export subtitles with ui_script_export_subtitles, or assemble voiced lines into a timeline with ui_script_send_to_timeline.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

const everyLineVoicedAndOnTimeline: ToolLoopStatePredicate<ScriptBridgeFinalState> =
  {
    name: "voicedAndOnTimeline",
    detail: "not every line is voiced, or the script has no timeline",
    test: (s) => s.hasTimeline && s.lines.every((l) => l.status === "voiced")
  };

export const SCRIPT_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<ScriptBridgeFinalState>[] =
  [
    {
      id: "voice-and-assemble",
      description:
        "Voice every line of a pre-seeded 2-line script and send it to the timeline",
      objective:
        "The script has a cast member with a bound voice and two draft lines assigned to them. Voice all the lines, then send the script to the timeline.",
      systemPrompt: SCRIPT_SYSTEM_PROMPT,
      createBridge: () =>
        createScriptToolBridge({
          cast: [
            {
              id: "spk_1",
              name: "Narrator",
              voice: { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" }
            }
          ],
          lines: [
            { id: "line_1", text: "The old house stood on the hill.", speakerId: "spk_1" },
            { id: "line_2", text: "No one had lived there for years.", speakerId: "spk_1" }
          ]
        }),
      expect: {
        requiredTools: ["ui_script_voice_all", "ui_script_send_to_timeline"],
        ordering: [["ui_script_voice_all", "ui_script_send_to_timeline"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 10,
        finalState: [everyLineVoicedAndOnTimeline]
      }
    },
    {
      id: "write-dialogue",
      description: "Write a short 2-character dialogue from an empty script",
      objective:
        "Add two cast members and write at least three lines of dialogue between them, each line assigned to one of the two cast members.",
      systemPrompt: SCRIPT_SYSTEM_PROMPT,
      createBridge: () => createScriptToolBridge(),
      expect: {
        requiredTools: ["ui_script_add_speaker", "ui_script_add_line"],
        forbiddenTools: ["ui_script_send_to_timeline"],
        noErrorResults: true,
        minToolCalls: 5,
        maxToolCalls: 20,
        finalState: [
          {
            name: "twoCastMembers",
            detail: "fewer than 2 cast members",
            test: (s) => s.cast.length >= 2
          },
          {
            name: "threeLines",
            detail: "fewer than 3 lines",
            test: (s) => s.lines.length >= 3
          },
          {
            name: "everyLineHasSpeaker",
            detail: "some line has no speaker assigned",
            test: (s) => s.lines.every((l) => l.speakerId !== null)
          }
        ]
      }
    },
    {
      id: "export-subtitles",
      description: "Voice a line and export it as SRT subtitles",
      objective:
        "The script has one draft line assigned to a cast member with a bound voice. Voice the line, then export the script's subtitles as SRT.",
      systemPrompt: SCRIPT_SYSTEM_PROMPT,
      createBridge: () =>
        createScriptToolBridge({
          cast: [
            {
              id: "spk_1",
              name: "Narrator",
              voice: { provider: "openai", model: "tts-1", voice: "alloy" }
            }
          ],
          lines: [
            { id: "line_1", text: "A single line, waiting to be heard.", speakerId: "spk_1" }
          ]
        }),
      expect: {
        requiredTools: ["ui_script_voice_line", "ui_script_export_subtitles"],
        ordering: [["ui_script_voice_line", "ui_script_export_subtitles"]],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 8,
        finalState: [
          {
            name: "lineVoiced",
            detail: "line_1 is not voiced",
            test: (s) =>
              s.lines.find((l) => l.id === "line_1")?.status === "voiced"
          }
        ]
      }
    }
  ];
