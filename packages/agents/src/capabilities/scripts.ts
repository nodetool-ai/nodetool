/**
 * The `scripts` capability module.
 *
 * Five capabilities that used to be five `Tool` subclasses in
 * `../tools/script-voice-tools.ts`: reading a script, voicing its lines through
 * the TTS provider, assembling the voiced takes into a timeline sequence, and
 * writing the lines in the first place.
 *
 * Wire names, descriptions and schemas are unchanged, and `voice_script_lines`
 * still delegates to `GenerateSpeechTool` — the one code path that knows how to
 * ask a provider for encoded audio and fall back to the streaming route.
 *
 * The voice rule (`effectiveVoice`), the staleness rule (`needsVoicing`) and
 * the script → timeline mapping (`buildScriptTimeline`) come from
 * `@nodetool-ai/timeline`, the same module the editor and the nodes use, so a
 * headlessly voiced script matches one voiced in the UI. Every heavy dependency
 * is imported inside the implementation that needs it.
 *
 * Design: docs/tool-class-retirement-design.md § "Migration".
 */

import type { JsonSchema, ProcessingContext } from "@nodetool-ai/runtime";
import type {
  Script,
  ScriptDocument,
  Storyboard,
  ScriptLine,
  ScriptSection,
  ScriptSpeaker,
  ScriptTake,
  ScriptVoiceBinding
} from "@nodetool-ai/models";
import type {
  Screenplay,
  ScriptLinkDocument,
  Shot,
  ShotScaffold
} from "@nodetool-ai/protocol";
import type { CaptionWord } from "@nodetool-ai/timeline";
import {
  isFunction,
  isNonBlankString,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../utils/type-guards.js";
import { UNGATED, createCapabilityRun } from "./invoke.js";
import { stampScriptStoryboardId } from "./script-link.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listScriptsSpec,
  createScriptSpec,
  getScriptSpec,
  voiceScriptLinesSpec,
  assembleScriptTimelineSpec,
  editScriptSpec,
  deriveStoryboardFromScriptSpec,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  DEFAULT_ASR_PROVIDER,
  DEFAULT_ASR_MODEL,
  LINE_TARGETS_SCHEMA,
  LIST_SCRIPTS_SCHEMA,
  GET_SCRIPT_SCHEMA,
  VOICE_SCRIPT_LINES_SCHEMA,
  ASSEMBLE_SCRIPT_TIMELINE_SCHEMA,
  EDIT_SCRIPT_SCHEMA,
  DERIVE_STORYBOARD_SCHEMA,
  deleteScriptSpec
} from "./scripts.specs.js";

export {
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  DEFAULT_ASR_PROVIDER,
  DEFAULT_ASR_MODEL,
  LINE_TARGETS_SCHEMA,
  LIST_SCRIPTS_SCHEMA,
  GET_SCRIPT_SCHEMA,
  VOICE_SCRIPT_LINES_SCHEMA,
  ASSEMBLE_SCRIPT_TIMELINE_SCHEMA,
  EDIT_SCRIPT_SCHEMA,
  DERIVE_STORYBOARD_SCHEMA
} from "./scripts.specs.js";
/** Lines one call may voice, so a whole-script call cannot run away. */
const MAX_LINES_PER_CALL = 60;
/** Attempts to land a document write: the first try plus one re-read-and-reapply (ADR 0001). */
const CAS_ATTEMPTS = 2;

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
  run: CapabilityRun,
  scriptId: unknown
): Promise<ScriptHandle | ToolError> {
  if (!isNonEmptyString(scriptId)) {
    return { error: "script_id is required (use list_scripts to find one)." };
  }
  const { Script } = await import("@nodetool-ai/models");
  const row = await Script.findById(scriptId);
  // A script owned by someone else reads as missing — the same rule the tRPC
  // router's ownership check applies.
  if (!row || row.user_id !== run.context.userId) {
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
  const { Script } = await import("@nodetool-ai/models");
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
    if (!updated)
      return { error: `Line ${lineId} is no longer in the script.` };
    const saved = await Script.updateFieldsIfUnchanged(
      scriptId,
      row.updated_at,
      { document: JSON.stringify({ ...doc, sections }) },
      // The take op rides on the write so an open editor merges this into its
      // draft per line instead of treating the whole script as replaced.
      {
        ops: [
          {
            tool: "append_take",
            input: { line_id: lineId, take_id: take.id }
          }
        ]
      }
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
  const { execFile: execFileCb } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { promises: fs } = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { PLACEHOLDER_LINE_MS } = await import("@nodetool-ai/timeline");
  const execFile = promisify(execFileCb);

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
  voice: ScriptVoiceBinding | null,
  helpers: {
    currentTake: (line: ScriptLine) => ScriptTake | undefined;
    needsVoicing: (line: ScriptLine, voice: ScriptVoiceBinding) => boolean;
  }
): "draft" | "stale" | "voiced" | "no_voice" {
  if (!voice) return "no_voice";
  if (!helpers.currentTake(line)) return "draft";
  return helpers.needsVoicing(line, voice) ? "stale" : "voiced";
}

// ---------------------------------------------------------------------------
// Script ↔ storyboard link
// ---------------------------------------------------------------------------

/** What a script's link to a storyboard looks like from the script's side. */
interface StoryboardLinkSummary {
  linked: boolean;
  storyboard_id: string | null;
  /** Lines the linked board covers with no shot. */
  orphan_line_ids: string[];
  /** Shots whose projected text no longer matches the lines they cover. */
  drifted_shot_ids: string[];
  /** The shot covering each line, for the lines a shot covers. */
  shot_id_by_line_id: Record<string, string>;
  issues: string[];
}

const EMPTY_LINK: StoryboardLinkSummary = {
  linked: false,
  storyboard_id: null,
  orphan_line_ids: [],
  drifted_shot_ids: [],
  shot_id_by_line_id: {},
  issues: []
};

/**
 * The board this script points at, and what its link looks like now.
 *
 * The board owns the link (design §1.1) and `scripts.storyboard_id` is the
 * back-pointer (design §1.2), so this is one read by id. A pointer at a board
 * that is gone, or at one that no longer names this script, is reported as an
 * issue rather than silently dropped — the script still works, only the link
 * affordances do not.
 */
async function storyboardLinkFor(
  userId: string | undefined,
  storyboardId: string | null,
  scriptId: string,
  doc: ScriptDocument
): Promise<StoryboardLinkSummary> {
  if (!userId || !storyboardId) return EMPTY_LINK;
  const { Storyboard } = await import("@nodetool-ai/models");
  const { orphanedLineIds, shotDialogueDrifted, validateScriptLink } =
    await import("@nodetool-ai/protocol");

  const stale = (message: string): StoryboardLinkSummary => ({
    ...EMPTY_LINK,
    storyboard_id: storyboardId,
    issues: [message]
  });

  const board = await Storyboard.findById(storyboardId);
  if (!board || board.user_id !== userId) {
    return stale(
      `Storyboard ${storyboardId} is no longer available, so the script's back-pointer is stale.`
    );
  }
  const boardDoc = board.toDocument();
  if (boardDoc.screenplay?.script_id !== scriptId) {
    return stale(
      `Storyboard ${storyboardId} does not link this script back, so the back-pointer is stale.`
    );
  }

  const screenplay: Screenplay = {
    ...boardDoc.screenplay,
    shots: boardDoc.shots
  };
  const scriptDoc: ScriptLinkDocument = { sections: doc.sections };
  const linesById = new Map(
    doc.sections.flatMap((section) =>
      section.lines.map((line) => [line.id, line] as const)
    )
  );
  const shotIdByLineId: Record<string, string> = {};
  for (const shot of screenplay.shots) {
    for (const lineId of shot.script_line_ids ?? []) {
      shotIdByLineId[lineId] = shot.id;
    }
  }
  const validation = validateScriptLink(screenplay, scriptDoc);
  return {
    linked: true,
    storyboard_id: board.id,
    orphan_line_ids: orphanedLineIds(screenplay, scriptDoc),
    drifted_shot_ids: screenplay.shots
      .filter((shot) => shotDialogueDrifted(shot, linesById))
      .map((shot) => shot.id),
    shot_id_by_line_id: shotIdByLineId,
    issues: [...validation.errors, ...validation.warnings].map(
      (issue) => issue.message
    )
  };
}

const listScripts: CapabilityExport = {
  spec: listScriptsSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { Script } = await import("@nodetool-ai/models");
    const { currentTake, effectiveVoice, needsVoicing, scriptLines } =
      await import("@nodetool-ai/timeline");
    const limit = Math.max(1, Math.min(Number(params["limit"]) || 20, 100));
    const rows = await Script.listByUser(userId, limit);
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
            (line) =>
              lineStatus(line, effectiveVoice(line, doc.cast), {
                currentTake,
                needsVoicing
              }) === "voiced"
          ).length,
          timeline_id: row.timeline_id ?? undefined,
          updated_at: row.updated_at
        };
      })
    };
  }
};

const createScript: CapabilityExport = {
  spec: createScriptSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const name = params["name"];
    if (!isNonBlankString(name)) {
      return { error: "name is required and must be a non-empty string." };
    }
    const { Script, emptyScriptDocument } = await import("@nodetool-ai/models");

    const requestedId = isNonBlankString(params["id"])
      ? params["id"].trim()
      : undefined;
    if (requestedId) {
      const existing = await Script.findById(requestedId);
      if (existing) {
        // A script someone else owns reads as taken, not as theirs to read.
        if (existing.user_id !== userId) {
          return { error: `A script with id ${requestedId} already exists.` };
        }
        return {
          ok: true,
          script_id: existing.id,
          name: existing.name,
          project_id: existing.project_id,
          updated_at: existing.updated_at
        };
      }
    }

    const fields: ConstructorParameters<typeof Script>[0] = {
      user_id: userId,
      project_id: isNonBlankString(params["project_id"])
        ? params["project_id"].trim()
        : "default",
      name: name.trim(),
      document: JSON.stringify(emptyScriptDocument())
    };
    if (requestedId) fields.id = requestedId;
    const script = new Script(fields);
    await script.save();
    return {
      ok: true,
      script_id: script.id,
      name: script.name,
      project_id: script.project_id,
      updated_at: script.updated_at
    };
  }
};

const getScript: CapabilityExport = {
  spec: getScriptSpec,
  impl: async (run, params) => {
    const handle = await loadScript(run, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;
    const { currentTake, effectiveVoice, needsVoicing, scriptLines } =
      await import("@nodetool-ai/timeline");
    const link = await storyboardLinkFor(
      run.context.userId,
      row.storyboard_id ?? null,
      row.id,
      doc
    );
    const orphans = new Set(link.orphan_line_ids);
    return {
      id: row.id,
      name: row.name,
      timeline_id: row.timeline_id ?? undefined,
      storyboard_id: link.storyboard_id,
      storyboard_link: link,
      cast: doc.cast.map((speaker) => ({
        id: speaker.id,
        name: speaker.name,
        voice: speaker.voice ?? null,
        entityId: (speaker as { entityId?: string | null }).entityId ?? null
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
          status: lineStatus(line, voice, { currentTake, needsVoicing }),
          take_count: line.takes.length,
          shot_id: link.shot_id_by_line_id[line.id] ?? null,
          orphaned: link.linked && orphans.has(line.id)
        };
      })
    };
  }
};

// ---------------------------------------------------------------------------
// voice_script_lines
// ---------------------------------------------------------------------------

/** The call-level voice override, or null when the lines' own voices apply. */
function voiceOverrideFrom(
  params: Record<string, unknown>
): ScriptVoiceBinding | null | ToolError {
  const provider = params["provider"];
  const model = params["model"];
  const voice = params["voice"];
  const any = [provider, model, voice].some((v) => isNonEmptyString(v));
  if (!any) return null;
  if (
    !isNonEmptyString(provider) ||
    !isNonEmptyString(model) ||
    !isNonEmptyString(voice)
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
  doc: ScriptDocument,
  helpers: {
    effectiveVoice: (
      line: ScriptLine,
      cast: ScriptDocument["cast"]
    ) => ScriptVoiceBinding | null;
    needsVoicing: (line: ScriptLine, voice: ScriptVoiceBinding) => boolean;
  }
): SelectedLine[] | ToolError {
  if (targets === undefined || targets === null) {
    return lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => {
        const voice = override ?? helpers.effectiveVoice(line, doc.cast);
        return (
          line.text.trim().length > 0 &&
          !!voice &&
          helpers.needsVoicing(line, voice)
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

const voiceScriptLines: CapabilityExport = {
  spec: voiceScriptLinesSpec,
  impl: async (run, params) => {
    const context = run.context;
    const handle = await loadScript(run, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;

    const override = voiceOverrideFrom(params);
    if (isError(override)) return override;

    const { effectiveVoice, needsVoicing, scriptLines } =
      await import("@nodetool-ai/timeline");
    const lines = scriptLines(doc.sections);
    const selected = selectLines(lines, params["targets"], override, doc, {
      effectiveVoice,
      needsVoicing
    });
    if (isError(selected)) return selected;
    if (selected.length === 0) {
      // "Every line with a voice is already up to date" was true of a script
      // whose lines have no voice at all — vacuously, since there were none to
      // be out of date. Read as written it says the work is done, and a chat
      // that had just written eight unvoiced lines took it that way. The reason
      // nothing was selected is the useful half, so it is the half reported.
      const withText = lines.filter((line) => line.text.trim().length > 0);
      const voiceless = withText.filter(
        (line) => !(override ?? effectiveVoice(line, doc.cast))
      );
      if (withText.length === 0) {
        return {
          voiced: 0,
          results: [],
          note: "This script has no line with text in it yet. Write lines with edit_script, then voice them."
        };
      }
      if (voiceless.length > 0) {
        return {
          voiced: 0,
          results: [],
          skipped_without_voice: voiceless.length,
          note:
            `${voiceless.length} of ${withText.length} lines have no voice, so nothing could be voiced` +
            (voiceless.length < withText.length
              ? "; the rest are already up to date. "
              : ". ") +
            'Give each speaker a voice with edit_script {"op": "set_speaker_voice", "target": "<speaker>", provider, model, voice} — find_model with capability=text_to_speech resolves one — or pass provider, model and voice to this call to override them all.'
        };
      }
      return {
        voiced: 0,
        results: [],
        note: `All ${withText.length} lines are voiced and up to date. Name lines explicitly with \`targets\` to re-voice them.`
      };
    }
    if (selected.length > MAX_LINES_PER_CALL) {
      return {
        error: `${selected.length} lines selected, over the ${MAX_LINES_PER_CALL}-line per-call limit. Pass targets in batches.`
      };
    }

    // Synthesis stays with `generate_speech`: it is the one place that knows
    // how to ask a provider for encoded audio, fall back to streaming PCM, and
    // persist the result as an asset.
    const { generateSpeech } = await import("./media.js");
    const speechRun = createCapabilityRun({ context, gate: UNGATED });

    const speed = isNumber(params["speed"]) ? params["speed"] : undefined;
    const transcribe = params["transcribe"] !== false;
    const asrProvider = isString(params["asr_provider"])
      ? params["asr_provider"]
      : DEFAULT_ASR_PROVIDER;
    const asrModel = isString(params["asr_model"])
      ? params["asr_model"]
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
          const synthesized = (await generateSpeech.impl(speechRun, {
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

          const { randomUUID } = await import("node:crypto");
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
          return {
            ...base,
            error: `text_to_speech failed: ${errorMessage(e)}`
          };
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
};

const assembleScriptTimeline: CapabilityExport = {
  spec: assembleScriptTimelineSpec,
  impl: async (run, params) => {
    const context = run.context;
    const handle = await loadScript(run, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;

    const { Script, TimelineSequence } = await import("@nodetool-ai/models");
    const { buildScriptTimeline, foreignTimelineParts } =
      await import("@nodetool-ai/timeline");

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
    const name = isNonEmptyString(params["name"])
      ? params["name"]
      : row.name;

    const existing = row.timeline_id
      ? await TimelineSequence.findById(row.timeline_id)
      : null;
    const reuse =
      existing && existing.user_id === context.userId ? existing : null;

    if (!reuse) {
      const sequence = new TimelineSequence({
        user_id: context.userId,
        project_id: row.project_id,
        name
      });
      sequence.name = name;
      sequence.fps = fps;
      sequence.duration_ms = assembled.durationMs;
      sequence.fromDocument({
        tracks: assembled.tracks,
        clips: assembled.clips,
        markers: []
      });
      await sequence.save();

      if (row.timeline_id !== sequence.id) {
        await Script.updateFieldsIfUnchanged(
          row.id,
          row.updated_at,
          { timeline_id: sequence.id },
          { ops: [{ tool: "set_link", input: { timeline_id: sequence.id } }] }
        );
      }

      return {
        ok: true,
        timeline_id: sequence.id,
        name: sequence.name,
        fps,
        duration_ms: assembled.durationMs,
        clip_count: assembled.clips.length,
        track_count: assembled.tracks.length,
        skipped_line_ids: assembled.skippedLineIds
      };
    }

    // Re-assembling over an existing sequence is a CAS write carrying its
    // ops (S2.1): the foreign parts are re-read per attempt, and an open
    // editor merges the change instead of seeing the sequence as replaced.
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const current =
        attempt === 0 ? reuse : await TimelineSequence.findById(reuse.id);
      if (
        !current ||
        current.user_id !== context.userId
      ) {
        return {
          error: `Timeline ${reuse.id} was deleted while assembling; create a new timeline by calling this again.`
        };
      }
      // Re-assembling replaces this script's voiceover track and clips, and
      // leaves everything another surface put in the sequence alone.
      const foreign = foreignTimelineParts(
        current.toDocument(),
        (clip) => clip.scriptId === row.id
      );
      const tracks = [...assembled.tracks, ...foreign.tracks];
      const clips = [...assembled.clips, ...foreign.clips];
      const durationMs = clips.reduce(
        (end, c) => Math.max(end, c.startMs + c.durationMs),
        0
      );
      const previous = current.toDocument();
      const nextDocument = {
        ...previous,
        tracks,
        clips,
        markers: previous.markers ?? []
      };
      const saved = await TimelineSequence.updateFieldsIfUnchanged(
        current.id,
        current.updated_at,
        {
          name,
          fps,
          duration_ms: durationMs,
          document: JSON.stringify(nextDocument)
        },
        {
          ops: [
            {
              tool: "assemble_script_timeline",
              input: { script_id: row.id }
            }
          ]
        }
      );
      if (!saved) continue;

      if (row.timeline_id !== current.id) {
        await Script.updateFieldsIfUnchanged(
          row.id,
          row.updated_at,
          { timeline_id: current.id },
          { ops: [{ tool: "set_link", input: { timeline_id: current.id } }] }
        );
      }

      return {
        ok: true,
        timeline_id: current.id,
        name,
        fps,
        duration_ms: durationMs,
        clip_count: clips.length,
        track_count: tracks.length,
        skipped_line_ids: assembled.skippedLineIds
      };
    }

    return {
      error: `Timeline ${reuse.id} is being modified concurrently; the assembly finished but could not be saved. Retry the call.`
    };
  }
};

// ---------------------------------------------------------------------------
// edit_script
// ---------------------------------------------------------------------------
//
// The voicing capabilities above turn written lines into audio; this one writes
// the lines. Adding a speaker, adding or rewriting a line, assigning a voice —
// all of it was browser-only, since the `ui_script_*` tools round-trip into the
// open editor's store. An agent could voice a script it could not author.

/** Operations one call may apply, so a runaway script cannot rewrite a script. */
const MAX_SCRIPT_OPS = 80;

const SCRIPT_OPS = [
  "add_speaker",
  "set_speaker",
  "set_speaker_voice",
  "remove_speaker",
  "add_section",
  "add_line",
  "set_line_text",
  "set_line_speaker",
  "remove_line"
] as const;

type ScriptOpName = (typeof SCRIPT_OPS)[number];

const isScriptOpName = (value: string): value is ScriptOpName =>
  (SCRIPT_OPS as readonly string[]).includes(value);

interface ParsedScriptOp {
  op: ScriptOpName;
  args: Record<string, unknown>;
}

/**
 * Every argument each op reads. An op used to take whatever object it was
 * handed and read the keys it knew, so a key it did not know was dropped in
 * silence: `add_line {text, speaker_id}` — the field name `get_script`
 * *reports* a line's speaker under — added the line with no speaker at all and
 * reported `ok`. A chat wrote eight lines that way, read them back unattributed,
 * and spent the rest of the session rebuilding the script twice trying to
 * work out which call had not taken. A key no op reads is now refused, by name.
 */
const OP_KEYS: Record<ScriptOpName, readonly string[]> = {
  add_speaker: [
    "name",
    "color",
    "provider",
    "model",
    "voice",
    "settings",
    "entityId",
    "entity_id"
  ],
  set_speaker: ["target", "name", "color", "entityId", "entity_id"],
  set_speaker_voice: ["target", "provider", "model", "voice", "settings"],
  remove_speaker: ["target"],
  add_section: ["title"],
  add_line: [
    "text",
    "speaker",
    "section",
    "direction",
    "pause_after_ms",
    "index"
  ],
  set_line_text: ["target", "text"],
  set_line_speaker: ["target", "speaker"],
  remove_line: ["target"]
};

/**
 * Spellings that mean one of an op's own keys. These are the names the rest of
 * the surface already uses for the same thing: `get_script` answers with `id`,
 * `speaker_id` and `line_id`, and reading a script then editing it by the
 * field names it just reported is consistency, not a mistake. Translating them
 * costs nothing; a spelling that would collide with a key already present is
 * refused rather than guessed at.
 */
const OP_ALIASES: Record<ScriptOpName, Readonly<Record<string, string>>> = {
  add_speaker: { speaker: "name", speaker_name: "name" },
  set_speaker: { id: "target", speaker: "target", speaker_id: "target" },
  set_speaker_voice: {
    id: "target",
    speaker: "target",
    speaker_id: "target"
  },
  remove_speaker: { id: "target", speaker: "target", speaker_id: "target" },
  add_section: { name: "title" },
  add_line: { speaker_id: "speaker", section_id: "section" },
  set_line_text: { id: "target", line: "target", line_id: "target" },
  set_line_speaker: {
    id: "target",
    line: "target",
    line_id: "target",
    speaker_id: "speaker"
  },
  remove_line: { id: "target", line: "target", line_id: "target" }
};

/**
 * One op's arguments, with the known aliases translated, or the reason it
 * cannot be applied as written.
 */
function normalizeOpArgs(
  op: ScriptOpName,
  index: number,
  raw: Record<string, unknown>
): Record<string, unknown> | ToolError {
  const known = OP_KEYS[op];
  const aliases = OP_ALIASES[op];
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (known.includes(key)) {
      args[key] = value;
      continue;
    }
    const alias = aliases[key];
    if (alias === undefined) {
      return {
        error: `ops[${index}] (${op}) has no argument "${key}"; it takes ${known.join(", ")}.`
      };
    }
    if (raw[alias] !== undefined) {
      return {
        error: `ops[${index}] (${op}) passes both "${key}" and "${alias}", which mean the same argument. Pass one.`
      };
    }
    args[alias] = value;
  }
  return args;
}

function parseScriptOps(raw: unknown): ParsedScriptOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      // The ops are listed here as well as in the spec: a caller that reached
      // this message was already guessing, and one that has to guess again
      // spends a turn calling edit_script with a made-up op just to read the
      // list off the rejection.
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_line", "text": "Hello."}]. ' +
        `The ops are: ${SCRIPT_OPS.join(", ")}.`
    };
  }
  if (raw.length > MAX_SCRIPT_OPS) {
    return {
      error: `ops holds ${raw.length} entries; at most ${MAX_SCRIPT_OPS} per call.`
    };
  }
  const parsed: ParsedScriptOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...rest } = entry;
    if (!isString(op) || !isScriptOpName(op.trim())) {
      return {
        error: `ops[${index}] names "${String(op)}"; expected one of ${SCRIPT_OPS.join(", ")}.`
      };
    }
    const name = op.trim() as ScriptOpName;
    const args = normalizeOpArgs(name, index, rest);
    if (isError(args)) return args;
    parsed.push({ op: name, args });
  }
  return parsed;
}

/** Resolve a speaker reference: id or name (case-insensitive). */
function findSpeakerIndex(doc: ScriptDocument, target: unknown): number {
  const raw = isString(target) ? target.trim() : "";
  const byId = doc.cast.findIndex((speaker) => speaker.id === raw);
  if (byId >= 0) return byId;
  const name = raw.toLowerCase();
  return doc.cast.findIndex(
    (speaker) => speaker.name.trim().toLowerCase() === name
  );
}

/**
 * Why a speaker op found no speaker. A speaker op whose `target` is a line id
 * is the same confusion twice over — the cast and the lines both answer to
 * `target`, and `set_speaker` reads as "set this line's speaker" — so the one
 * mistake worth naming is named.
 */
function noSpeaker(doc: ScriptDocument, target: unknown): Error {
  const raw = isString(target) ? target.trim() : String(target);
  const cast = doc.cast.map((speaker) => `${speaker.id} (${speaker.name})`);
  const looksLikeLine = /^line[_-]?\d+$/i.test(raw);
  return new Error(
    `No speaker matches "${raw}".` +
      (looksLikeLine
        ? ' That is a line id — to give a line a speaker use {"op": "set_line_speaker", "target": "<line>", "speaker": "<speaker>"}.'
        : "") +
      (cast.length > 0
        ? ` The cast is: ${cast.join(", ")}.`
        : " This script has no cast yet; add one with add_speaker.")
  );
}

/** The section an op addresses: by id, else the last one, else a fresh one. */
function resolveSection(doc: ScriptDocument, target: unknown) {
  if (isNonBlankString(target)) {
    const found = doc.sections.find((section) => section.id === target.trim());
    if (!found) throw new Error(`No section matches "${target}".`);
    return found;
  }
  if (doc.sections.length === 0) {
    const section = { id: `section_1`, lines: [] };
    doc.sections.push(section);
    return section;
  }
  return doc.sections[doc.sections.length - 1];
}

function mintId(prefix: string, used: Set<string>): string {
  let n = used.size + 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

/** A provider/model/voice triple, all three or none — never a half-guess. */
function parseVoiceBinding(
  args: Record<string, unknown>
): ScriptVoiceBinding | null {
  const provider = args["provider"];
  const model = args["model"];
  const voice = args["voice"];
  const given = [provider, model, voice].filter((v) => isString(v));
  if (given.length === 0) return null;
  if (given.length !== 3) {
    throw new Error(
      "A voice needs provider, model and voice together (use find_model to pick one)."
    );
  }
  const binding: ScriptVoiceBinding = {
    provider: String(provider),
    model: String(model),
    voice: String(voice)
  };
  if (isObjectLike(args["settings"])) {
    binding.settings = args["settings"];
  }
  return binding;
}

interface ScriptOpRecord {
  op: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * The key an op's own vocabulary names its unit by. The editor's merge adapter
 * reads `line_id` before `target` before `id`, so stamping every key on every
 * op would file a speaker op under `section.lines`. One key per op, plus the
 * canonical `id` every consumer can read.
 */
const UNIT_KEY_BY_OP: Record<string, "target" | "line_id"> = {
  set_speaker: "target",
  set_speaker_voice: "target",
  remove_speaker: "target",
  set_line_text: "line_id",
  set_line_speaker: "line_id",
  remove_line: "line_id"
};

/** Apply one script operation. Returns its summary, or throws with the reason. */
function applyScriptOp(
  doc: ScriptDocument,
  { op, args }: ParsedScriptOp,
  scriptLines: (sections: ScriptDocument["sections"]) => ScriptLine[]
) {
  // entity linkage — accept `entityId` or `entity_id`, string to link, null/"" to clear
  const entityIdArg = (a: Record<string, unknown>): string | null | undefined => {
    const raw = a["entityId"] ?? a["entity_id"];
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    if (isString(raw)) {
      const v = raw.trim();
      return v.length > 0 ? v : null;
    }
    throw new Error("entityId must be a string (asset id from list_entities) or null to clear.");
  };

  switch (op) {
    case "add_speaker": {
      const name = args["name"];
      if (!isNonBlankString(name)) {
        throw new Error("add_speaker needs a non-empty `name`.");
      }
      const speaker: ScriptSpeaker = {
        id: mintId("speaker", new Set(doc.cast.map((s) => s.id))),
        name: name.trim(),
        voice: parseVoiceBinding(args)
      };
      if (isString(args["color"])) speaker.color = args["color"];
      const eid = entityIdArg(args);
      if (eid !== undefined) speaker.entityId = eid;
      doc.cast.push(speaker);
      return {
        id: speaker.id,
        name: speaker.name,
        has_voice: !!speaker.voice,
        entityId: speaker.entityId ?? null
      };
    }

    case "set_speaker": {
      const index = findSpeakerIndex(doc, args["target"]);
      if (index < 0) throw noSpeaker(doc, args["target"]);
      const speaker = { ...doc.cast[index] };
      if (args["name"] !== undefined) speaker.name = String(args["name"]);
      if (args["color"] !== undefined) speaker.color = String(args["color"]);
      const eid = entityIdArg(args);
      if (eid !== undefined) speaker.entityId = eid;
      doc.cast[index] = speaker;
      return { id: speaker.id, name: speaker.name, entityId: speaker.entityId ?? null };
    }

    case "set_speaker_voice": {
      const index = findSpeakerIndex(doc, args["target"]);
      if (index < 0) throw noSpeaker(doc, args["target"]);
      const voice = parseVoiceBinding(args);
      if (!voice) {
        throw new Error(
          "set_speaker_voice needs provider, model and voice (use find_model to pick one)."
        );
      }
      // Every take voiced with the old binding is now stale — `needsVoicing`
      // reads that off the take's own `voiceSnapshot`, so nothing to write.
      doc.cast[index] = { ...doc.cast[index], voice };
      return { id: doc.cast[index].id, voice };
    }

    case "remove_speaker": {
      const index = findSpeakerIndex(doc, args["target"]);
      if (index < 0) throw noSpeaker(doc, args["target"]);
      const [removed] = doc.cast.splice(index, 1);
      for (const section of doc.sections) {
        section.lines = section.lines.map((line) =>
          line.speakerId === removed.id ? { ...line, speakerId: null } : line
        );
      }
      return { removed: removed.id };
    }

    case "add_section": {
      const section: ScriptSection = {
        id: mintId("section", new Set(doc.sections.map((s) => s.id))),
        lines: []
      };
      if (isString(args["title"])) section.title = args["title"];
      doc.sections.push(section);
      return { id: section.id, title: section.title };
    }

    case "add_line": {
      const text = args["text"];
      if (!isNonBlankString(text)) {
        throw new Error("add_line needs a non-empty `text`.");
      }
      const section = resolveSection(doc, args["section"]);
      let speakerId: string | null = null;
      if (args["speaker"] !== undefined) {
        const index = findSpeakerIndex(doc, args["speaker"]);
        if (index < 0) throw noSpeaker(doc, args["speaker"]);
        speakerId = doc.cast[index].id;
      }
      const used = new Set(scriptLines(doc.sections).map((line) => line.id));
      const line: ScriptLine = {
        id: mintId("line", used),
        speakerId,
        text,
        takes: []
      };
      if (isString(args["direction"])) {
        line.direction = args["direction"];
      }
      if (isNumber(args["pause_after_ms"])) {
        line.pauseAfterMs = args["pause_after_ms"];
      }
      const at = isNumber(args["index"])
        ? Math.max(0, Math.min(Math.trunc(args["index"]), section.lines.length))
        : section.lines.length;
      section.lines.splice(at, 0, line);
      return { id: line.id, section_id: section.id, index: at };
    }

    case "set_line_text": {
      const target = String(args["target"] ?? "");
      const line = findLine(scriptLines(doc.sections), target);
      if (!line) throw new Error(`No line matches "${target}".`);
      const text = args["text"];
      if (!isNonBlankString(text)) {
        throw new Error("set_line_text needs a non-empty `text`.");
      }
      // The takes stay: each carries the text it was voiced from, so rewriting
      // the line makes them stale rather than gone, and `voice_script_lines`
      // re-records exactly those.
      line.text = text;
      return { id: line.id, text: line.text, status: "stale" };
    }

    case "set_line_speaker": {
      const target = String(args["target"] ?? "");
      const line = findLine(scriptLines(doc.sections), target);
      if (!line) throw new Error(`No line matches "${target}".`);
      const index = findSpeakerIndex(doc, args["speaker"]);
      if (index < 0) throw noSpeaker(doc, args["speaker"]);
      line.speakerId = doc.cast[index].id;
      return { id: line.id, speaker_id: line.speakerId };
    }

    case "remove_line": {
      const target = String(args["target"] ?? "");
      const line = findLine(scriptLines(doc.sections), target);
      if (!line) throw new Error(`No line matches "${target}".`);
      for (const section of doc.sections) {
        section.lines = section.lines.filter((l) => l.id !== line.id);
      }
      return { removed: line.id };
    }
  }
}

const editScript: CapabilityExport = {
  spec: editScriptSpec,
  impl: async (run, params) => {
    const ops = parseScriptOps(params["ops"]);
    if (isError(ops)) return ops;

    const { Script } = await import("@nodetool-ai/models");
    const { scriptLines } = await import("@nodetool-ai/timeline");

    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const script = await loadScript(run, params["script_id"]);
      if (isError(script)) return script;
      const { row, doc } = script;

      // A failing op is recorded and the script continues: stopping at the
      // first error hides every problem behind it.
      const records: ScriptOpRecord[] = [];
      const resolvedOps: { tool: string; input: Record<string, unknown> }[] = [];
      for (const parsed of ops) {
        try {
          const result = applyScriptOp(doc, parsed, scriptLines) as
            | Record<string, unknown>
            | undefined;
          records.push({
            op: parsed.op,
            ok: true,
            result
          });
          const canonicalId =
            typeof result?.["id"] === "string"
              ? (result["id"] as string)
              : typeof result?.["removed"] === "string"
                ? (result["removed"] as string)
                : undefined;
          const key = UNIT_KEY_BY_OP[parsed.op];
          resolvedOps.push({
            tool: parsed.op,
            input:
              canonicalId && key
                ? { ...parsed.args, [key]: canonicalId, id: canonicalId }
                : parsed.args
          });
        } catch (e) {
          records.push({ op: parsed.op, ok: false, error: errorMessage(e) });
          resolvedOps.push({ tool: parsed.op, input: parsed.args });
        }
      }

      const saved = await Script.updateFieldsIfUnchanged(
        row.id,
        row.updated_at,
        {
          document: JSON.stringify(doc)
        },
        // The ops ride on the write so an open editor merges this change per
        // merge unit instead of treating the script as replaced.
        { ops: resolvedOps }
      );
      if (!saved) continue;

      const failed = records.filter((record) => !record.ok);
      return {
        script_id: row.id,
        updated_at: saved.updated_at,
        applied: records.length - failed.length,
        failed: failed.length,
        ops: records,
        cast: doc.cast.map((speaker) => ({
          id: speaker.id,
          name: speaker.name,
          has_voice: !!speaker.voice,
          entityId: (speaker as { entityId?: string | null }).entityId ?? null
        })),
        lines: scriptLines(doc.sections).map((line, index) => ({
          id: line.id,
          index,
          speaker_id: line.speakerId ?? null,
          text: line.text,
          takes: line.takes.length
        }))
      };
    }

    return {
      error: `Script ${String(params["script_id"])} is being modified concurrently; nothing was saved. Retry the call.`
    };
  }
};

// ---------------------------------------------------------------------------
// derive_storyboard_from_script
// ---------------------------------------------------------------------------
//
// `deriveShotScaffold` pins linkage, order and the projected text
// deterministically; shot *content* — action, slug, camera, motion — is the
// director's job. The normalizer holds the line: a response that drops or
// reassigns `script_line_ids` is refused and retried, and the scaffold is the
// floor a failed director pass falls back to.

/** Attempts at a director response that keeps every scaffold's line links. */
const DIRECTOR_ATTEMPTS = 2;

interface DirectorModel {
  provider: string;
  model: string;
}

/**
 * The model the director pass runs on. Both fields absent means "no director" —
 * the scaffold ships as it is. One without the other is a mistake worth naming
 * rather than guessing at, the same posture the render tools take.
 */
function resolveDirectorModel(
  params: Record<string, unknown>
): DirectorModel | null | ToolError {
  const provider =
    isString(params["provider"]) ? params["provider"].trim() : "";
  const model =
    isString(params["model"]) ? params["model"].trim() : "";
  if (!provider && !model) return null;
  if (!provider || !model) {
    return {
      error:
        "The director pass needs provider and model together (use find_model with capability=text_generation). Omit both for the deterministic scaffold."
    };
  }
  return { provider, model };
}

const DIRECTOR_SHOTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["shots"],
  properties: {
    style: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["script_line_ids", "action"],
        properties: {
          script_line_ids: { type: "array", items: { type: "string" } },
          action: { type: "string" },
          slug: { type: "string" },
          motion: { type: "string" },
          duration_seconds: { type: "number" },
          camera: {
            type: "object",
            additionalProperties: false,
            properties: {
              framing: { type: "string" },
              lens: { type: "string" },
              angle: { type: "string" },
              movement: { type: "string" }
            }
          }
        }
      }
    }
  }
};

const DIRECTOR_SYSTEM_PROMPT = [
  "You are a film director turning a written script into a shot list.",
  "Each shot below already covers a fixed set of script lines. Keep every",
  "shot's `script_line_ids` exactly as given — same ids, same order, one entry",
  "per shot — and write what the camera sees: a concrete visual `action`, plus",
  "`slug`, `camera` and `motion` where they help. Call the shots tool once."
].join(" ");

const optionalText = (value: unknown): string | undefined => {
  const text = isString(value) ? value.trim() : "";
  return text.length > 0 ? text : undefined;
};

/**
 * Merge a director response onto the scaffold, or say why it cannot be trusted.
 * Shots are matched by the line ids they claim, so a response that drops a
 * shot, invents one, or moves a line between shots fails here rather than
 * producing a board whose links no longer describe the script.
 */
function normalizeDirectedShots(
  raw: unknown,
  scaffoldShots: Shot[]
): Shot[] | ToolError {
  const shots =
    isObjectLike(raw)
      ? (raw as { shots?: unknown }).shots
      : undefined;
  if (!Array.isArray(shots)) {
    return { error: "the response carried no `shots` array" };
  }
  if (shots.length !== scaffoldShots.length) {
    return {
      error: `the response has ${shots.length} shots; the script's scaffold has ${scaffoldShots.length}`
    };
  }

  const key = (ids: readonly string[]): string => ids.join("\u0000");
  const byKey = new Map(
    scaffoldShots.map((shot) => [key(shot.script_line_ids ?? []), shot])
  );
  const directed = new Map<string, Shot>();

  for (const [index, entry] of shots.entries()) {
    if (!isRecord(entry)) {
      return { error: `shots[${index}] is not an object` };
    }
    const args = entry as Record<string, unknown>;
    const lineIds = args["script_line_ids"];
    if (!Array.isArray(lineIds) || lineIds.some((id) => !isString(id))) {
      return { error: `shots[${index}] dropped its \`script_line_ids\`` };
    }
    const scaffold = byKey.get(key(lineIds as string[]));
    if (!scaffold) {
      return {
        error: `shots[${index}] reassigned its lines to [${(lineIds as string[]).join(", ")}], which no scaffold shot covers`
      };
    }
    if (directed.has(scaffold.id)) {
      return {
        error: `shots[${index}] repeats the lines already covered by shot ${scaffold.id}`
      };
    }
    const action = optionalText(args["action"]);
    if (!action) {
      return { error: `shots[${index}] has no \`action\`` };
    }

    const shot: Shot = { ...scaffold, action };
    const slug = optionalText(args["slug"]);
    if (slug) shot.slug = slug;
    const motion = optionalText(args["motion"]);
    if (motion) shot.motion = motion;
    const camera = args["camera"];
    if (isRecord(camera)) {
      shot.camera = camera as Shot["camera"];
    }
    const seconds = Number(args["duration_seconds"]);
    if (Number.isFinite(seconds) && seconds > 0) {
      shot.duration_seconds = seconds;
    }
    directed.set(scaffold.id, shot);
  }

  const missing = scaffoldShots.filter((shot) => !directed.has(shot.id));
  if (missing.length > 0) {
    return {
      error: `the response covers no shot for lines [${(missing[0].script_line_ids ?? []).join(", ")}]`
    };
  }
  return scaffoldShots.map((shot) => directed.get(shot.id) as Shot);
}

/** One director round-trip, returning whatever the provider answered with. */
async function callDirector(
  context: ProcessingContext,
  model: DirectorModel,
  userPrompt: string
): Promise<unknown> {
  const provider = await context.getProvider(model.provider);
  const call =
    isFunction(provider.generateMessageTraced)
      ? provider.generateMessageTraced.bind(provider)
      : provider.generateMessage.bind(provider);
  const result = await call({
    model: model.model,
    messages: [
      { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ],
    tools: [
      {
        name: "shots",
        description:
          "Submit the directed shots, one per scaffold entry, with the line ids unchanged.",
        inputSchema: DIRECTOR_SHOTS_SCHEMA
      }
    ],
    toolChoice: "shots"
  });
  const call0 = result.toolCalls?.[0];
  return call0?.name === "shots" ? call0.args : null;
}

const deriveStoryboardFromScript: CapabilityExport = {
  spec: deriveStoryboardFromScriptSpec,
  impl: async (run, params) => {
    const context = run.context;
    const handle = await loadScript(run, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;

    const model = resolveDirectorModel(params);
    if (isError(model)) return model;

    const { deriveShotScaffold, joinLineTexts, validateScriptLink } =
      await import("@nodetool-ai/protocol");
    const scaffolds: ShotScaffold[] = deriveShotScaffold({
      id: row.id,
      cast: doc.cast,
      sections: doc.sections
    });
    if (scaffolds.length === 0) {
      return {
        error: `Script ${row.id} has no line with text, so there is nothing to storyboard. Write the lines with edit_script first.`
      };
    }

    const textByLineId = new Map(
      doc.sections.flatMap((section) =>
        section.lines.map((line) => [line.id, line.text] as const)
      )
    );
    const stamp = Date.now().toString(36);
    const scaffoldShots: Shot[] = scaffolds.map((scaffold, index) => {
      const shot: Shot = {
        type: "shot",
        id: `shot_${index + 1}_${stamp}`,
        index,
        // The floor a failed director pass falls back to: the words the shot
        // covers, standing in for the visual nobody has described yet.
        action: scaffold.dialogue ?? scaffold.narration ?? "",
        status: "planned",
        script_line_ids: scaffold.script_line_ids,
        script_text_snapshot: joinLineTexts(
          scaffold.script_line_ids.map((id) => textByLineId.get(id) ?? "")
        )
      };
      if (scaffold.dialogue) shot.dialogue = scaffold.dialogue;
      if (scaffold.narration) shot.narration = scaffold.narration;
      return shot;
    });

    let shots = scaffoldShots;
    let directorRounds = 0;
    let directorNote: string | undefined;
    if (model) {
      const brief = scaffolds
        .map(
          (scaffold, index) =>
            `${index + 1}. script_line_ids=${JSON.stringify(scaffold.script_line_ids)} ` +
            `words=${JSON.stringify(scaffold.dialogue ?? scaffold.narration ?? "")}`
        )
        .join("\n");
      let complaint = "";
      for (let attempt = 0; attempt < DIRECTOR_ATTEMPTS; attempt++) {
        directorRounds += 1;
        let normalized: Shot[] | ToolError;
        try {
          const raw = await callDirector(
            context,
            model,
            `Script: ${row.name}\n\nShots to direct, in order:\n${brief}` +
              (complaint ? `\n\nYour last answer was rejected: ${complaint}` : "")
          );
          normalized = normalizeDirectedShots(raw, scaffoldShots);
        } catch (e) {
          normalized = { error: errorMessage(e) };
        }
        if (!isError(normalized)) {
          shots = normalized;
          directorNote = undefined;
          break;
        }
        complaint = normalized.error;
        directorNote = `The director pass was refused after ${directorRounds} attempt(s) (${complaint}); the shots are the deterministic scaffold.`;
      }
    }

    const screenplay: Screenplay = {
      type: "screenplay",
      id: `sp_${stamp}`,
      title: row.name,
      shots,
      script_id: row.id
    };
    const validation = validateScriptLink(screenplay, { sections: doc.sections });
    if (validation.errors.length > 0) {
      return {
        error: `The derived board would not validate, so nothing was created: ${validation.errors
          .map((issue) => issue.message)
          .join(" ")}`
      };
    }

    // The board is created already carrying `script_id` and every shot's line
    // references, so the forward link needs no second write. The script's
    // back-pointer does, and it is stamped after — a board that exists without
    // the pointer is consistent and navigable from the board side, while a
    // pointer written first could name a board that was never created.
    // Bound as a namespace so the `Storyboard` row type imported at the top of
    // this file stays visible here.
    const models = await import("@nodetool-ai/models");
    const name =
      isString(params["name"]) && params["name"]
        ? (params["name"] as string)
        : row.name;
    const board = await models.Storyboard.create<Storyboard>({
      user_id: context.userId,
      project_id: row.project_id,
      name,
      document: JSON.stringify({
        screenplay,
        shots,
        brief: "",
        style: "",
        entityIds: [],
        aspectRatio: "16:9",
        directorModel: model
          ? { type: "language_model", provider: model.provider, id: model.model }
          : null,
        imageModel: null,
        videoModel: null
      })
    });

    const stamped = await stampScriptStoryboardId(
      row.id,
      board.id,
      context.userId
    );
    if (isError(stamped)) {
      return {
        error: `Storyboard ${board.id} was created and links script ${row.id}, but the script's back-pointer could not be written: ${stamped.error} The board is valid; the script reads as unlinked until this is retried.`,
        storyboard_id: board.id,
        script_id: row.id
      };
    }

    return {
      ok: true,
      storyboard_id: board.id,
      script_id: row.id,
      name: board.name,
      shot_count: shots.length,
      directed: shots !== scaffoldShots,
      director_rounds: directorRounds,
      note: directorNote,
      warnings: validation.warnings.map((issue) => issue.message),
      shots: shots.map((shot) => ({
        id: shot.id,
        index: shot.index,
        slug: shot.slug,
        action: shot.action,
        status: shot.status,
        script_line_ids: shot.script_line_ids ?? []
      }))
    };
  }
};

/** Every script capability, in the order the tool file declared them. */
/**
 * Delete a script the caller owns.
 *
 * The ownership check and the version cascade are `Script.deleteOwned`, the
 * same function the tRPC route calls — a delete is not a place for two copies
 * of one rule, and version rows outliving their document would be unreachable
 * garbage. Missing and not-yours are one answer.
 */
const deleteScript: CapabilityExport = {
  spec: deleteScriptSpec,
  impl: async (run, params) => {
    const userId = run.context.userId;
    if (!userId) return { error: "No user is bound to this session." };
    const { Script } = await import("@nodetool-ai/models");
    const id = String(params["script_id"]);
    const deleted = await Script.deleteOwned(userId, id);
    return deleted
      ? { script_id: id, deleted: true }
      : { error: `Script ${id} was not found, or it is not yours.` };
  }
};
export const SCRIPT_CAPABILITIES: readonly CapabilityExport[] = [
  listScripts,
  createScript,
  getScript,
  voiceScriptLines,
  assembleScriptTimeline,
  editScript,
  deriveStoryboardFromScript,
  deleteScript
];

export const module: CapabilityModule = {
  module: "scripts",
  exports: SCRIPT_CAPABILITIES
};

export {
  listScripts,
  createScript,
  getScript,
  voiceScriptLines,
  assembleScriptTimeline,
  editScript,
  deriveStoryboardFromScript,
  deleteScript
};
