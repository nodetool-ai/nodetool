/**
 * Script voicing tools — the fast path from a written script to voiced takes
 * and an assembled voiceover sequence, with no workflow in between.
 *
 * The script editor voices a line over the chat WebSocket's `generate_media` /
 * `transcribe_audio` RPCs, and `nodetool.script.*` nodes do it inside a
 * workflow. An agent working headlessly (chat, CLI, MCP) had neither: it had to
 * author and run a workflow, or drive the `ui_script_*` tools, which only work
 * while that script is open in a browser. These tools call the provider
 * directly, save each take as an asset, and write it back onto the persisted
 * script.
 *
 *   list_scripts             — find a script to work on
 *   get_script               — cast, lines, and each line's voicing status
 *   voice_script_lines       — synthesize the lines that need it, many per call
 *   assemble_script_timeline — voiced takes → a saved timeline sequence
 *
 * The voice rule (`effectiveVoice`), the staleness rule (`needsVoicing`) and
 * the script → timeline mapping (`buildScriptTimeline`) come from
 * `@nodetool-ai/timeline`, the same module the editor and the nodes use, so a
 * headlessly voiced script matches one voiced in the UI.
 *
 * Every write is a compare-and-swap against the row's `updated_at` with a
 * bounded retry, because lines are voiced concurrently and each take lands on
 * the same script document.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Script, TimelineSequence } from "@nodetool-ai/models";
import type {
  ScriptDocument,
  ScriptLine,
  ScriptTake,
  ScriptVoiceBinding
} from "@nodetool-ai/models";
import {
  buildScriptTimeline,
  currentTake,
  effectiveVoice,
  needsVoicing,
  scriptLines,
  PLACEHOLDER_LINE_MS
} from "@nodetool-ai/timeline";
import type { CaptionWord } from "@nodetool-ai/timeline";
import { Tool } from "./base-tool.js";
import { GenerateSpeechTool } from "./media-tools.js";

const execFile = promisify(execFileCb);

/** Lines voiced at once. Bounded so one call cannot fan out unboundedly. */
const DEFAULT_CONCURRENCY = 3;
const MAX_CONCURRENCY = 8;
/** Lines one call may voice, so a whole-script call cannot run away. */
const MAX_LINES_PER_CALL = 60;
/** Attempts to land a document write before reporting a conflict. */
const CAS_ATTEMPTS = 5;

/** Word-timing default, matching the editor's take transcription. */
const DEFAULT_ASR_PROVIDER = "openai";
const DEFAULT_ASR_MODEL = "whisper-1";

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

interface ScriptHandle {
  row: Script;
  doc: ScriptDocument;
}

async function loadScript(
  context: ProcessingContext,
  scriptId: unknown
): Promise<ScriptHandle | ToolError> {
  if (typeof scriptId !== "string" || !scriptId) {
    return { error: "script_id is required (use list_scripts to find one)." };
  }
  const row = await Script.findById(scriptId);
  // A script owned by someone else reads as missing — the same rule the tRPC
  // router's ownership check applies.
  if (!row || row.user_id !== context.userId) {
    return { error: `Script ${scriptId} was not found.` };
  }
  return { row, doc: row.toDocument() };
}

/** Resolve a line reference: line id, 0-based reading-order index, or its text. */
function findLine(lines: ScriptLine[], target: string): ScriptLine | undefined {
  const byId = lines.find((l) => l.id === target);
  if (byId) return byId;
  const index = Number(target);
  if (Number.isInteger(index) && index >= 0 && index < lines.length) {
    return lines[index];
  }
  const text = target.trim().toLowerCase();
  return lines.find((l) => l.text.trim().toLowerCase() === text);
}

function clampConcurrency(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONCURRENCY;
  return Math.min(n, MAX_CONCURRENCY);
}

/** Run `task` over `items`, at most `limit` in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        results[index] = await task(items[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

/**
 * Append a take to one line and persist the script.
 *
 * Lines are voiced concurrently against a single row, so the write is a CAS on
 * `updated_at`: on conflict the row is re-read and the take appended to the
 * fresher document, never to the stale copy the synthesis started from.
 */
async function appendTake(
  scriptId: string,
  lineId: string,
  take: ScriptTake
): Promise<ScriptLine | ToolError> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    const row = await Script.findById(scriptId);
    if (!row) return { error: `Script ${scriptId} was not found.` };
    const doc = row.toDocument();
    let updated: ScriptLine | undefined;
    const sections = doc.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => {
        if (line.id !== lineId) return line;
        updated = {
          ...line,
          takes: [...line.takes, take],
          currentTakeId: take.id
        };
        return updated;
      })
    }));
    if (!updated) return { error: `Line ${lineId} is no longer in the script.` };
    const saved = await Script.updateFieldsIfUnchanged(
      scriptId,
      row.updated_at,
      { document: JSON.stringify({ ...doc, sections }) }
    );
    if (saved) return updated;
  }
  return {
    error: `Script ${scriptId} is being modified concurrently; the take was synthesized but could not be saved. Retry the call.`
  };
}

/**
 * Duration of the synthesized audio.
 *
 * ffprobe is the accurate answer and is what the editor's browser probe and the
 * VoiceScript node both effectively measure. When it is unavailable (no ffmpeg
 * on PATH), the last word timing is a close second, and the placeholder is the
 * floor — a take is still playable and still assemblable without an exact
 * length.
 */
async function measureDurationMs(
  bytes: Uint8Array,
  words: CaptionWord[]
): Promise<number> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-voice-"));
  const file = path.join(dir, "take");
  try {
    await fs.writeFile(file, bytes);
    const { stdout } = await execFile("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file
    ]);
    const seconds = parseFloat(stdout.trim());
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.round(seconds * 1000);
    }
  } catch {
    // ffprobe missing or unreadable output — fall through to the estimates.
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  const lastWordEnd = words.length > 0 ? words[words.length - 1].endMs : 0;
  return lastWordEnd > 0 ? lastWordEnd : PLACEHOLDER_LINE_MS;
}

/** Word timings for a take. Best-effort: a failed pass leaves the take playable. */
async function transcribeWords(
  context: ProcessingContext,
  audio: Uint8Array,
  provider: string,
  model: string
): Promise<CaptionWord[]> {
  try {
    const asr = await context.getProvider(provider);
    const result = await asr.automaticSpeechRecognition({
      audio,
      model,
      word_timestamps: true
    });
    return (result.chunks ?? [])
      .map((chunk) => ({
        word: chunk.text.trim(),
        startMs: Math.round(chunk.timestamp[0] * 1000),
        endMs: Math.round(chunk.timestamp[1] * 1000)
      }))
      .filter((w) => w.word.length > 0);
  } catch {
    return [];
  }
}

/** Per-line outcome, one row per selected line. */
interface LineOutcome {
  line_id: string;
  index: number;
  text: string;
  ok: boolean;
  take_id?: string;
  asset_id?: string;
  duration_ms?: number;
  word_count?: number;
  error?: string;
}

/** The voicing state of a line, as the editor's gutter shows it. */
function lineStatus(
  line: ScriptLine,
  voice: ScriptVoiceBinding | null
): "draft" | "stale" | "voiced" | "no_voice" {
  if (!voice) return "no_voice";
  if (!currentTake(line)) return "draft";
  return needsVoicing(line, voice) ? "stale" : "voiced";
}

const LINE_TARGETS_SCHEMA = {
  type: "array" as const,
  items: { type: "string" as const },
  description:
    "Lines to voice, each a line id, 0-based reading-order index, or the " +
    "line's exact text. Omit to voice every line that is unvoiced or stale."
};

export class ListScriptsTool extends Tool {
  readonly name = "list_scripts";
  readonly description =
    "List the caller's scripts, newest first: id, name, cast size, line count, " +
    "how many lines are voiced, and the timeline it was assembled into. Start " +
    "here when the user names a script but not its id.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      limit: {
        type: "number" as const,
        description: "Max scripts to return (default 20)."
      }
    }
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    if (!context.userId) return { error: "No user is bound to this session." };
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const rows = await Script.listByUser(context.userId, limit);
    return {
      scripts: rows.map((row) => {
        const doc = row.toDocument();
        const lines = scriptLines(doc.sections);
        return {
          id: row.id,
          name: row.name,
          cast: doc.cast.length,
          lines: lines.length,
          voiced: lines.filter(
            (line) => lineStatus(line, effectiveVoice(line, doc.cast)) === "voiced"
          ).length,
          timeline_id: row.timeline_id ?? undefined,
          updated_at: row.updated_at
        };
      })
    };
  }

  userMessage(): string {
    return "Listing scripts";
  }
}

export class GetScriptTool extends Tool {
  readonly name = "get_script";
  readonly description =
    "Read one script: its cast with each speaker's voice, and every line in " +
    "reading order with its id, index, speaker, text, direction, pause, " +
    "effective voice, and voicing status ('draft' = never voiced, 'stale' = " +
    "text or voice changed since the take, 'voiced' = up to date, 'no_voice' = " +
    "no speaker voice assigned). Call this before voicing — the other tools " +
    "address lines by these ids.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      script_id: { type: "string" as const, description: "Script id." }
    },
    required: ["script_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const handle = await loadScript(context, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;
    return {
      id: row.id,
      name: row.name,
      timeline_id: row.timeline_id ?? undefined,
      cast: doc.cast.map((speaker) => ({
        id: speaker.id,
        name: speaker.name,
        voice: speaker.voice ?? null
      })),
      lines: scriptLines(doc.sections).map((line, index) => {
        const voice = effectiveVoice(line, doc.cast);
        return {
          id: line.id,
          index,
          speaker_id: line.speakerId ?? null,
          text: line.text,
          direction: line.direction,
          pause_after_ms: line.pauseAfterMs,
          voice,
          status: lineStatus(line, voice),
          take_count: line.takes.length
        };
      })
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Reading script ${String(params["script_id"])}`;
  }
}

export class VoiceScriptLinesTool extends Tool {
  readonly name = "voice_script_lines";
  readonly description =
    "Synthesize speech for a script's lines by calling the TTS provider " +
    "directly — no workflow is created or run. Each take is saved as an audio " +
    "asset, appended to its line, and made the line's current take (earlier " +
    "takes are kept). Omit `targets` to voice every line that is unvoiced or " +
    "stale, so a whole script is one call. Each line uses its own voice (its " +
    "override, else its speaker's) unless you pass provider/model/voice to " +
    "override them all. Word timings are transcribed best-effort so the " +
    "assembled timeline carries captions.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      script_id: { type: "string" as const, description: "Script id." },
      targets: LINE_TARGETS_SCHEMA,
      provider: {
        type: "string" as const,
        description:
          "TTS provider id (from find_model, capability=text_to_speech). Overrides every line's own voice."
      },
      model: {
        type: "string" as const,
        description: "TTS model id (from find_model). Overrides every line's own voice."
      },
      voice: {
        type: "string" as const,
        description: "Voice id for the override. Required when provider/model are passed."
      },
      speed: {
        type: "number" as const,
        description: "Speech speed multiplier passed to the provider (e.g. 0.25–4.0)."
      },
      transcribe: {
        type: "boolean" as const,
        description:
          "Transcribe each take for word timings (default true). Set false to skip the extra ASR call."
      },
      asr_provider: {
        type: "string" as const,
        description: `Provider for word timings (default ${DEFAULT_ASR_PROVIDER}).`
      },
      asr_model: {
        type: "string" as const,
        description: `Model for word timings (default ${DEFAULT_ASR_MODEL}).`
      },
      concurrency: {
        type: "number" as const,
        description: `Lines voiced in parallel (default ${DEFAULT_CONCURRENCY}, max ${MAX_CONCURRENCY}).`
      }
    },
    required: ["script_id"]
  };

  private readonly speech = new GenerateSpeechTool();

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const handle = await loadScript(context, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;

    const override = voiceOverrideFrom(params);
    if (isError(override)) return override;

    const lines = scriptLines(doc.sections);
    const selected = selectLines(lines, params["targets"], override, doc);
    if (isError(selected)) return selected;
    if (selected.length === 0) {
      return {
        voiced: 0,
        results: [],
        note: "No line needs voicing. Every line with a voice is already up to date; name lines explicitly with `targets` to re-voice them."
      };
    }
    if (selected.length > MAX_LINES_PER_CALL) {
      return {
        error: `${selected.length} lines selected, over the ${MAX_LINES_PER_CALL}-line per-call limit. Pass targets in batches.`
      };
    }

    const speed = typeof params["speed"] === "number" ? params["speed"] : undefined;
    const transcribe = params["transcribe"] !== false;
    const asrProvider =
      typeof params["asr_provider"] === "string"
        ? (params["asr_provider"] as string)
        : DEFAULT_ASR_PROVIDER;
    const asrModel =
      typeof params["asr_model"] === "string"
        ? (params["asr_model"] as string)
        : DEFAULT_ASR_MODEL;

    const results = await mapWithConcurrency(
      selected,
      clampConcurrency(params["concurrency"]),
      async ({ line, index }): Promise<LineOutcome> => {
        const base: LineOutcome = {
          line_id: line.id,
          index,
          text: line.text,
          ok: false
        };
        const text = line.text.trim();
        if (!text) return { ...base, error: "Line has no text to voice." };
        const voice = override ?? effectiveVoice(line, doc.cast);
        if (!voice) {
          return {
            ...base,
            error:
              "Line has no voice — give its speaker a voice, set a per-line override, or pass provider/model/voice to this call."
          };
        }

        try {
          const synthesized = (await this.speech.process(context, {
            provider: voice.provider,
            model: voice.model,
            text,
            voice: voice.voice,
            speed
          })) as {
            asset_id?: string;
            asset_uri?: string;
            error?: string;
          };
          if (synthesized.error) return { ...base, error: synthesized.error };
          if (!synthesized.asset_id) {
            return {
              ...base,
              error:
                "The take was synthesized but could not be saved as an asset, so it cannot be attached to the line. This host has no asset storage wired."
            };
          }

          const { bytes } = await context.resolveAssetBytes(
            synthesized.asset_uri ?? synthesized.asset_id
          );
          const audio = bytes ?? new Uint8Array();
          const words = transcribe
            ? await transcribeWords(context, audio, asrProvider, asrModel)
            : [];
          const durationMs = await measureDurationMs(audio, words);

          const take: ScriptTake = {
            id: `take_${randomUUID()}`,
            assetId: synthesized.asset_id,
            durationMs,
            words,
            textSnapshot: line.text,
            voiceSnapshot: voice,
            createdAt: new Date().toISOString()
          };
          const saved = await appendTake(row.id, line.id, take);
          if (isError(saved)) return { ...base, error: saved.error };

          return {
            ...base,
            ok: true,
            take_id: take.id,
            asset_id: take.assetId,
            duration_ms: durationMs,
            word_count: words.length
          };
        } catch (e) {
          return { ...base, error: `text_to_speech failed: ${errorMessage(e)}` };
        }
      }
    );

    return {
      script_id: row.id,
      voiced: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const targets = params["targets"];
    const count = Array.isArray(targets) ? `${targets.length} ` : "";
    return `Voicing ${count}script lines`;
  }
}

/** The call-level voice override, or null when the lines' own voices apply. */
function voiceOverrideFrom(
  params: Record<string, unknown>
): ScriptVoiceBinding | null | ToolError {
  const provider = params["provider"];
  const model = params["model"];
  const voice = params["voice"];
  const any = [provider, model, voice].some((v) => typeof v === "string" && v);
  if (!any) return null;
  if (
    typeof provider !== "string" ||
    !provider ||
    typeof model !== "string" ||
    !model ||
    typeof voice !== "string" ||
    !voice
  ) {
    return {
      error:
        "A voice override needs all three of provider, model, and voice (use find_model with capability=text_to_speech). Omit all three to use each line's own voice."
    };
  }
  return { provider, model, voice };
}

interface SelectedLine {
  line: ScriptLine;
  index: number;
}

/**
 * The lines a voicing call acts on: the explicit `targets` when given, else
 * every line that needs voicing — the default that makes a whole script one
 * call. An override applies to every named line, since the caller chose the
 * voice; without one, staleness is measured against the line's own voice.
 */
function selectLines(
  lines: ScriptLine[],
  targets: unknown,
  override: ScriptVoiceBinding | null,
  doc: ScriptDocument
): SelectedLine[] | ToolError {
  if (targets === undefined || targets === null) {
    return lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => {
        const voice = override ?? effectiveVoice(line, doc.cast);
        return (
          line.text.trim().length > 0 && !!voice && needsVoicing(line, voice)
        );
      });
  }
  const list = Array.isArray(targets) ? targets : [targets];
  const selected: SelectedLine[] = [];
  for (const raw of list) {
    const target = String(raw);
    const line = findLine(lines, target);
    if (!line) {
      return {
        error: `No line matches "${target}". Call get_script to list line ids and indexes.`
      };
    }
    if (selected.some((s) => s.line.id === line.id)) continue;
    selected.push({ line, index: lines.indexOf(line) });
  }
  return selected;
}

export class AssembleScriptTimelineTool extends Tool {
  readonly name = "assemble_script_timeline";
  readonly description =
    "Lay a script's voiced takes end to end into a voiceover timeline sequence " +
    "and save it, without building a workflow. Each clip carries its take's " +
    "word timings, the speaker label, and a link back to its script line, so a " +
    "later re-voice can round-trip into the cut. Lines with no voiced take are " +
    "skipped and listed. Re-running rebuilds the same sequence in place, " +
    "keeping clips other surfaces added. Validate the result with " +
    "validate_timeline before rendering.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      script_id: { type: "string" as const, description: "Script id." },
      name: {
        type: "string" as const,
        description: "Name for the sequence. Defaults to the script's name."
      },
      fps: { type: "number" as const, description: "Frame rate (default 30)." }
    },
    required: ["script_id"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const handle = await loadScript(context, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;

    const assembled = buildScriptTimeline({
      scriptId: row.id,
      cast: doc.cast,
      sections: doc.sections
    });
    if (assembled.clips.length === 0) {
      return {
        error:
          "No line has a voiced take, so there is nothing to assemble. Run voice_script_lines first.",
        skipped_line_ids: assembled.skippedLineIds
      };
    }

    const fps = Math.max(1, Math.min(Number(params["fps"]) || 30, 120));
    const name =
      typeof params["name"] === "string" && params["name"]
        ? (params["name"] as string)
        : row.name;

    const existing = row.timeline_id
      ? await TimelineSequence.findById(row.timeline_id)
      : null;
    const reuse = existing && existing.user_id === context.userId ? existing : null;

    let tracks = assembled.tracks;
    let clips = assembled.clips;
    let durationMs = assembled.durationMs;

    if (reuse) {
      // Re-assembling replaces this script's voiceover track and clips, and
      // leaves everything another surface put in the sequence alone.
      const previous = reuse.toDocument();
      const foreignClips = previous.clips.filter((c) => c.scriptId !== row.id);
      const scriptTrackIds = new Set(
        previous.clips.filter((c) => c.scriptId === row.id).map((c) => c.trackId)
      );
      const foreignTrackIds = new Set(foreignClips.map((c) => c.trackId));
      const foreignTracks = previous.tracks.filter(
        (t) => foreignTrackIds.has(t.id) || !scriptTrackIds.has(t.id)
      );
      tracks = [...assembled.tracks, ...foreignTracks];
      clips = [...assembled.clips, ...foreignClips];
      durationMs = clips.reduce(
        (end, c) => Math.max(end, c.startMs + c.durationMs),
        0
      );
    }

    const sequence =
      reuse ??
      new TimelineSequence({
        user_id: context.userId,
        project_id: row.project_id,
        name
      });
    sequence.name = name;
    sequence.fps = fps;
    sequence.duration_ms = durationMs;
    sequence.fromDocument({
      ...(reuse ? reuse.toDocument() : {}),
      tracks,
      clips,
      markers: reuse ? reuse.toDocument().markers : []
    });
    await sequence.save();

    if (row.timeline_id !== sequence.id) {
      await Script.updateFieldsIfUnchanged(row.id, row.updated_at, {
        timeline_id: sequence.id
      });
    }

    return {
      ok: true,
      timeline_id: sequence.id,
      name: sequence.name,
      fps,
      duration_ms: durationMs,
      clip_count: clips.length,
      track_count: tracks.length,
      skipped_line_ids: assembled.skippedLineIds
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Assembling script ${String(params["script_id"])} into a timeline`;
  }
}

/** Every tool in this module, for toolbelt assembly and docs. */
export const SCRIPT_VOICE_TOOL_NAMES = [
  "list_scripts",
  "get_script",
  "voice_script_lines",
  "assemble_script_timeline"
] as const;
