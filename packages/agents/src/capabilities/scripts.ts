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
  ScriptLine,
  ScriptSection,
  ScriptSpeaker,
  ScriptTake,
  ScriptVoiceBinding
} from "@nodetool-ai/models";
import type { CaptionWord } from "@nodetool-ai/timeline";
import { UNGATED, createCapabilityRun } from "./invoke.js";
import type {
  CapabilityExport,
  CapabilityModule,
  CapabilityRun
} from "./types.js";
import {
  listScriptsSpec,
  getScriptSpec,
  voiceScriptLinesSpec,
  assembleScriptTimelineSpec,
  editScriptSpec,
  DEFAULT_CONCURRENCY,
  MAX_CONCURRENCY,
  DEFAULT_ASR_PROVIDER,
  DEFAULT_ASR_MODEL,
  LINE_TARGETS_SCHEMA,
  LIST_SCRIPTS_SCHEMA,
  GET_SCRIPT_SCHEMA,
  VOICE_SCRIPT_LINES_SCHEMA,
  ASSEMBLE_SCRIPT_TIMELINE_SCHEMA,
  EDIT_SCRIPT_SCHEMA
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
  EDIT_SCRIPT_SCHEMA
} from "./scripts.specs.js";
/** Lines one call may voice, so a whole-script call cannot run away. */
const MAX_LINES_PER_CALL = 60;
/** Attempts to land a document write before reporting a conflict. */
const CAS_ATTEMPTS = 5;

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
  if (typeof scriptId !== "string" || !scriptId) {
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

const getScript: CapabilityExport = {
  spec: getScriptSpec,
  impl: async (run, params) => {
    const handle = await loadScript(run, params["script_id"]);
    if (isError(handle)) return handle;
    const { row, doc } = handle;
    const { currentTake, effectiveVoice, needsVoicing, scriptLines } =
      await import("@nodetool-ai/timeline");
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
          status: lineStatus(line, voice, { currentTake, needsVoicing }),
          take_count: line.takes.length
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

    // Synthesis stays with `generate_speech`: it is the one place that knows
    // how to ask a provider for encoded audio, fall back to streaming PCM, and
    // persist the result as an asset.
    const { generateSpeech } = await import("./media.js");
    const speechRun = createCapabilityRun({ context, gate: UNGATED });

    const speed =
      typeof params["speed"] === "number" ? params["speed"] : undefined;
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
    const { buildScriptTimeline } = await import("@nodetool-ai/timeline");

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
    const reuse =
      existing && existing.user_id === context.userId ? existing : null;

    let tracks = assembled.tracks;
    let clips = assembled.clips;
    let durationMs = assembled.durationMs;

    if (reuse) {
      // Re-assembling replaces this script's voiceover track and clips, and
      // leaves everything another surface put in the sequence alone.
      const previous = reuse.toDocument();
      const foreignClips = previous.clips.filter((c) => c.scriptId !== row.id);
      const scriptTrackIds = new Set(
        previous.clips
          .filter((c) => c.scriptId === row.id)
          .map((c) => c.trackId)
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
    const previous = reuse?.toDocument();
    sequence.fromDocument({
      ...previous,
      tracks,
      clips,
      markers: previous ? previous.markers : []
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

function parseScriptOps(raw: unknown): ParsedScriptOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_line", "text": "Hello."}].'
    };
  }
  if (raw.length > MAX_SCRIPT_OPS) {
    return {
      error: `ops holds ${raw.length} entries; at most ${MAX_SCRIPT_OPS} per call.`
    };
  }
  const parsed: ParsedScriptOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...args } = entry as Record<string, unknown>;
    if (typeof op !== "string" || !isScriptOpName(op.trim())) {
      return {
        error: `ops[${index}] names "${String(op)}"; expected one of ${SCRIPT_OPS.join(", ")}.`
      };
    }
    parsed.push({ op: op.trim() as ScriptOpName, args });
  }
  return parsed;
}

/** Resolve a speaker reference: id or name (case-insensitive). */
function findSpeakerIndex(doc: ScriptDocument, target: unknown): number {
  const raw = typeof target === "string" ? target.trim() : "";
  const byId = doc.cast.findIndex((speaker) => speaker.id === raw);
  if (byId >= 0) return byId;
  const name = raw.toLowerCase();
  return doc.cast.findIndex(
    (speaker) => speaker.name.trim().toLowerCase() === name
  );
}

/** The section an op addresses: by id, else the last one, else a fresh one. */
function resolveSection(doc: ScriptDocument, target: unknown) {
  if (typeof target === "string" && target.trim() !== "") {
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
  const given = [provider, model, voice].filter((v) => typeof v === "string");
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
  if (args["settings"] && typeof args["settings"] === "object") {
    binding.settings = args["settings"] as Record<string, unknown>;
  }
  return binding;
}

interface ScriptOpRecord {
  op: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Apply one script operation. Returns its summary, or throws with the reason. */
function applyScriptOp(
  doc: ScriptDocument,
  { op, args }: ParsedScriptOp,
  scriptLines: (sections: ScriptDocument["sections"]) => ScriptLine[]
): unknown {
  switch (op) {
    case "add_speaker": {
      const name = args["name"];
      if (typeof name !== "string" || name.trim() === "") {
        throw new Error("add_speaker needs a non-empty `name`.");
      }
      const speaker: ScriptSpeaker = {
        id: mintId("speaker", new Set(doc.cast.map((s) => s.id))),
        name: name.trim(),
        voice: parseVoiceBinding(args)
      };
      if (typeof args["color"] === "string") speaker.color = args["color"];
      doc.cast.push(speaker);
      return { id: speaker.id, name: speaker.name, has_voice: !!speaker.voice };
    }

    case "set_speaker": {
      const index = findSpeakerIndex(doc, args["target"]);
      if (index < 0)
        throw new Error(`No speaker matches "${String(args["target"])}".`);
      const speaker = { ...doc.cast[index] };
      if (args["name"] !== undefined) speaker.name = String(args["name"]);
      if (args["color"] !== undefined) speaker.color = String(args["color"]);
      doc.cast[index] = speaker;
      return { id: speaker.id, name: speaker.name };
    }

    case "set_speaker_voice": {
      const index = findSpeakerIndex(doc, args["target"]);
      if (index < 0)
        throw new Error(`No speaker matches "${String(args["target"])}".`);
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
      if (index < 0)
        throw new Error(`No speaker matches "${String(args["target"])}".`);
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
      if (typeof args["title"] === "string") section.title = args["title"];
      doc.sections.push(section);
      return { id: section.id, title: section.title };
    }

    case "add_line": {
      const text = args["text"];
      if (typeof text !== "string" || text.trim() === "") {
        throw new Error("add_line needs a non-empty `text`.");
      }
      const section = resolveSection(doc, args["section"]);
      let speakerId: string | null = null;
      if (args["speaker"] !== undefined) {
        const index = findSpeakerIndex(doc, args["speaker"]);
        if (index < 0) {
          throw new Error(`No speaker matches "${String(args["speaker"])}".`);
        }
        speakerId = doc.cast[index].id;
      }
      const used = new Set(scriptLines(doc.sections).map((line) => line.id));
      const line: ScriptLine = {
        id: mintId("line", used),
        speakerId,
        text,
        takes: []
      };
      if (typeof args["direction"] === "string") {
        line.direction = args["direction"];
      }
      if (typeof args["pause_after_ms"] === "number") {
        line.pauseAfterMs = args["pause_after_ms"];
      }
      const at =
        typeof args["index"] === "number"
          ? Math.max(
              0,
              Math.min(Math.trunc(args["index"]), section.lines.length)
            )
          : section.lines.length;
      section.lines.splice(at, 0, line);
      return { id: line.id, section_id: section.id, index: at };
    }

    case "set_line_text": {
      const target = String(args["target"] ?? "");
      const line = findLine(scriptLines(doc.sections), target);
      if (!line) throw new Error(`No line matches "${target}".`);
      const text = args["text"];
      if (typeof text !== "string" || text.trim() === "") {
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
      if (index < 0) {
        throw new Error(`No speaker matches "${String(args["speaker"])}".`);
      }
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
      for (const parsed of ops) {
        try {
          records.push({
            op: parsed.op,
            ok: true,
            result: applyScriptOp(doc, parsed, scriptLines)
          });
        } catch (e) {
          records.push({ op: parsed.op, ok: false, error: errorMessage(e) });
        }
      }

      const saved = await Script.updateFieldsIfUnchanged(
        row.id,
        row.updated_at,
        {
          document: JSON.stringify(doc)
        }
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
          has_voice: !!speaker.voice
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

/** Every script capability, in the order the tool file declared them. */
export const SCRIPT_CAPABILITIES: readonly CapabilityExport[] = [
  listScripts,
  getScript,
  voiceScriptLines,
  assembleScriptTimeline,
  editScript
];

export const module: CapabilityModule = {
  module: "scripts",
  exports: SCRIPT_CAPABILITIES
};

export {
  listScripts,
  getScript,
  voiceScriptLines,
  assembleScriptTimeline,
  editScript
};
