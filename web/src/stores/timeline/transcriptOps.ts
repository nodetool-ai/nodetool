/**
 * transcriptOps — the clip↔text projection and the pure edits behind it.
 *
 * Descript's core trick is that the transcript is an editable *index* over the
 * media, not a separate document. Here that means the timeline's **clips are
 * the single source of truth** and the transcript is *projected* from the
 * word-level captions the clips carry. `buildTranscriptDoc` walks the
 * transcript-bearing clips in timeline order and emits word tokens with
 * absolute timings; every text operation maps back to a clip cut / move /
 * relabel and commits through `TimelineStore.setTranscriptAndClips` so one user
 * action lands as one coherent edit (and one undo entry).
 *
 * Word timings are clip-local (relative to `clip.startMs`), so splitting,
 * moving, or re-flowing a clip never rewrites the words — they travel with the
 * clip and stay valid against its new position.
 *
 * Nothing here touches the DOM, the network, or any store — it is trivially
 * unit-testable, mirroring `sceneModel`.
 */

import { makeClip, createTimeOrderedUuid } from "@nodetool-ai/timeline";
import type {
  CaptionWord,
  CaptionWordKind,
  ClipStatus,
  TimelineClip,
  TranscriptLine
} from "@nodetool-ai/timeline";

/** Beat length used before a line's voiceover has been generated/probed. */
export const PLACEHOLDER_BEAT_MS = 3000;

// ── Projected document ───────────────────────────────────────────────────────

/** How a transcript segment's media was produced. */
export type TranscriptSegmentKind = "generated" | "imported";

/** One word of the projected transcript, located on the absolute timeline. */
export interface TranscriptToken {
  /** The media clip this word indexes into (the span a cut would remove). */
  clipId: string;
  /** Index of the word within `clip.caption.words`. */
  wordIndex: number;
  text: string;
  /** Absolute timeline start = `clip.startMs + word.startMs`. */
  startMs: number;
  /** Absolute timeline end = `clip.startMs + word.endMs`. */
  endMs: number;
  kind: CaptionWordKind;
  confidence?: number;
}

/**
 * A paragraph of the transcript: a maximal run of consecutive transcript clips
 * that share a `paragraphId` (so the two halves of an interior word-deletion
 * read as one paragraph, while distinct authored beats stay separate). It is
 * the unit the editor renders as a block and a whole-paragraph delete / reorder
 * operates on; each token still carries its own `clipId` so word edits map to
 * the right media span.
 */
export interface TranscriptSegment {
  /** Stable id — the paragraph key (shared `paragraphId` of its clips). */
  id: string;
  /** Backing clips, in timeline order. A single draft, or 1..n voiced pieces. */
  clipIds: string[];
  kind: TranscriptSegmentKind;
  speaker?: string;
  startMs: number;
  endMs: number;
  /** True when the paragraph is one un-voiced draft beat (no words yet). */
  isDraft: boolean;
  /** For a draft segment, the un-aligned text to show (the TTS prompt). */
  draftText: string;
  /** Generation / transcription status (failed if any piece failed). */
  status: ClipStatus;
  tokens: TranscriptToken[];
}

/** The transcript projected from the timeline's clips. */
export interface TranscriptDoc {
  segments: TranscriptSegment[];
  /** End of the last transcript clip on the timeline. */
  durationMs: number;
}

export interface ReflowedClips {
  clips: TimelineClip[];
  /** Total timeline length after laying generated beats end-to-end. */
  durationMs: number;
}

// ── Clip classification ──────────────────────────────────────────────────────

/** The clip is a generated voiceover beat (TTS), voiced or still a draft. */
export function isVoiceoverBeat(clip: TimelineClip): boolean {
  return clip.bindingKind === "text-to-audio";
}

/** The clip carries transcribed words. */
export function hasWords(clip: TimelineClip): boolean {
  return (clip.caption?.words?.length ?? 0) > 0;
}

/**
 * A clip belongs to the transcript when it carries a caption (words, or an
 * imported clip awaiting transcription) or is a voiceover beat awaiting
 * generation. Plain media with no caption (background music, B-roll dragged
 * straight onto a track) is excluded.
 */
export function isTranscriptClip(clip: TimelineClip): boolean {
  return clip.caption !== undefined || isVoiceoverBeat(clip);
}

// ── Projection ───────────────────────────────────────────────────────────────

/**
 * Non-lexical disfluencies that filler-word removal targets by default. Kept
 * conservative (clear non-words only) so removal never eats meaningful speech;
 * context-dependent fillers like "like" / "so" / "you know" are deliberately
 * excluded.
 */
const FILLER_WORDS = new Set([
  "um",
  "umm",
  "uh",
  "uhh",
  "uhm",
  "erm",
  "er",
  "eh",
  "ah",
  "hmm",
  "mhm",
  "mm",
  "uh-huh",
  "mm-hmm"
]);

/** Normalize a token for filler matching: lowercase, trim trailing punctuation. */
function normalizeToken(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:]+$/, "").trim();
}

/** Whether a word reads as a filler ("um", "uh", …). */
export function isFillerWord(text: string): boolean {
  return FILLER_WORDS.has(normalizeToken(text));
}

/** A word's effective kind: its explicit kind, else filler-or-word by lexicon. */
function normalizeKind(word: CaptionWord): CaptionWordKind {
  return word.kind ?? (isFillerWord(word.word) ? "filler" : "word");
}

/** Order transcript clips by timeline position, with a stable id tie-break. */
function byTimeline(a: TimelineClip, b: TimelineClip): number {
  return a.startMs - b.startMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The paragraph a clip belongs to — its `paragraphId`, or itself when unset. */
function paragraphKey(clip: TimelineClip): string {
  return clip.paragraphId ?? clip.id;
}

/** End of the last clip of any kind — the transcript's covered length. */
function maxEnd(clips: TimelineClip[]): number {
  return clips.reduce((max, c) => Math.max(max, c.startMs + c.durationMs), 0);
}

function buildSegment(key: string, members: TimelineClip[]): TranscriptSegment {
  const tokens: TranscriptToken[] = [];
  for (const clip of members) {
    const offset = clip.startMs;
    (clip.caption?.words ?? []).forEach((word, wordIndex) => {
      tokens.push({
        clipId: clip.id,
        wordIndex,
        text: word.word,
        startMs: offset + word.startMs,
        endMs: offset + word.endMs,
        kind: normalizeKind(word),
        confidence: word.confidence
      });
    });
  }

  const first = members[0];
  const last = members[members.length - 1];
  // A draft is an un-voiced authored beat; an imported clip awaiting
  // transcription is not a draft (it has no prompt to edit).
  const isDraft =
    members.length === 1 &&
    tokens.length === 0 &&
    first.sourceType !== "imported";
  return {
    id: key,
    clipIds: members.map((c) => c.id),
    kind: first.sourceType === "imported" ? "imported" : "generated",
    speaker: first.speaker,
    startMs: first.startMs,
    endMs: last.startMs + last.durationMs,
    isDraft,
    draftText: isDraft ? (first.prompt ?? "") : "",
    status: members.some((c) => c.status === "failed") ? "failed" : first.status,
    tokens
  };
}

/**
 * Project the editable transcript from the timeline's clips. Consecutive clips
 * sharing a `paragraphId` collapse into one paragraph (segment); each word
 * becomes an absolute-timed token tagged with its source clip. The result is
 * the read model the editor renders and the map a click-to-seek / select /
 * delete uses to translate text positions back to the timeline.
 */
export function buildTranscriptDoc(clips: TimelineClip[]): TranscriptDoc {
  const sorted = clips.filter(isTranscriptClip).sort(byTimeline);
  const segments: TranscriptSegment[] = [];

  let i = 0;
  while (i < sorted.length) {
    const key = paragraphKey(sorted[i]);
    const members: TimelineClip[] = [];
    while (i < sorted.length && paragraphKey(sorted[i]) === key) {
      members.push(sorted[i]);
      i += 1;
    }
    segments.push(buildSegment(key, members));
  }

  return { segments, durationMs: maxEnd(sorted) };
}

// ── Layout ───────────────────────────────────────────────────────────────────

function beatLength(clip: TimelineClip): number {
  return clip.durationMs > 0 ? clip.durationMs : PLACEHOLDER_BEAT_MS;
}

/**
 * Lay the generated voiceover beats (text-to-audio clips) end-to-end starting
 * at 0, in `orderedBeatIds` order when given, otherwise in current timeline
 * order. This keeps the authored voiceover gap-free as beats are added,
 * voiced (their real duration probed), deleted, or reordered. Words are
 * clip-local so they need no rewrite. Clips that are not voiceover beats
 * (imported media, B-roll) keep their positions.
 *
 * `durationMs` is the end of the last clip of *any* kind, so imported media
 * extending past the voiceover still counts toward the sequence length.
 */
export function reflowGenerated(
  clips: TimelineClip[],
  orderedBeatIds?: string[]
): ReflowedClips {
  const beats = clips.filter(isVoiceoverBeat);

  let ordered: TimelineClip[];
  if (orderedBeatIds) {
    const byId = new Map(beats.map((c) => [c.id, c]));
    ordered = orderedBeatIds
      .map((id) => byId.get(id))
      .filter((c): c is TimelineClip => c !== undefined);
    for (const beat of beats) if (!orderedBeatIds.includes(beat.id)) ordered.push(beat);
  } else {
    ordered = [...beats].sort(byTimeline);
  }

  const patched = new Map<string, TimelineClip>();
  let cursor = 0;
  for (const beat of ordered) {
    const durationMs = beatLength(beat);
    if (beat.startMs !== cursor || beat.durationMs !== durationMs) {
      patched.set(beat.id, { ...beat, startMs: cursor, durationMs });
    }
    cursor += durationMs;
  }

  const nextClips = patched.size
    ? clips.map((c) => patched.get(c.id) ?? c)
    : clips;
  const durationMs = nextClips.reduce(
    (max, c) => Math.max(max, c.startMs + c.durationMs),
    0
  );
  return { clips: nextClips, durationMs };
}

// ── Word-level editing ops ───────────────────────────────────────────────────

/** A reference to a single transcript word — a selection endpoint. */
export interface TokenRef {
  clipId: string;
  wordIndex: number;
}

/**
 * Resolve a word selection (two endpoints, in any order) against a projected
 * document to the absolute time span it covers and the tokens within it.
 * Returns null when either endpoint is no longer present (e.g. after an edit).
 */
export function resolveSelectionRange(
  doc: TranscriptDoc,
  anchor: TokenRef,
  focus: TokenRef
): { startMs: number; endMs: number; tokens: TranscriptToken[] } | null {
  const flat = doc.segments.flatMap((s) => s.tokens);
  const findIndex = (ref: TokenRef): number =>
    flat.findIndex(
      (t) => t.clipId === ref.clipId && t.wordIndex === ref.wordIndex
    );
  const a = findIndex(anchor);
  const b = findIndex(focus);
  if (a === -1 || b === -1) return null;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const tokens = flat.slice(lo, hi + 1);
  return {
    startMs: tokens[0].startMs,
    endMs: tokens[tokens.length - 1].endMs,
    tokens
  };
}

/** The head remnant of `clip`, keeping clip-local [0, lengthMs). */
function headRemnant(clip: TimelineClip, lengthMs: number): TimelineClip {
  const inPointMs = clip.inPointMs ?? 0;
  const words = (clip.caption?.words ?? []).filter((w) => w.endMs <= lengthMs);
  return {
    ...clip,
    durationMs: lengthMs,
    inPointMs,
    outPointMs: inPointMs + lengthMs,
    caption: clip.caption ? { ...clip.caption, words } : undefined
  };
}

/** The tail remnant of `clip`, keeping clip-local [fromMs, dur), placed at `startMs`. */
function tailRemnant(
  clip: TimelineClip,
  fromMs: number,
  startMs: number
): TimelineClip {
  const inPointMs = clip.inPointMs ?? 0;
  const outPointMs = clip.outPointMs ?? inPointMs + clip.durationMs;
  const words = (clip.caption?.words ?? [])
    .filter((w) => w.startMs >= fromMs)
    .map((w) => ({ ...w, startMs: w.startMs - fromMs, endMs: w.endMs - fromMs }));
  return {
    ...clip,
    id: createTimeOrderedUuid(),
    startMs,
    durationMs: clip.durationMs - fromMs,
    inPointMs: inPointMs + fromMs,
    outPointMs,
    caption: clip.caption ? { ...clip.caption, words } : undefined
  };
}

/**
 * Ripple-delete the absolute time span [startMs, endMs) across every track:
 * clips fully inside are dropped, clips overlapping an edge are trimmed (their
 * words partitioned and the tail's rebased), and everything after shifts left
 * by the span length so the gap closes — the "editing text = editing media"
 * core. B-roll on other tracks ripples too, keeping the composition in sync.
 */
export function rippleDeleteRange(
  clips: TimelineClip[],
  startMs: number,
  endMs: number
): ReflowedClips {
  if (endMs <= startMs) return { clips, durationMs: maxEnd(clips) };
  const span = endMs - startMs;
  const next: TimelineClip[] = [];

  for (const clip of clips) {
    const cStart = clip.startMs;
    const cEnd = clip.startMs + clip.durationMs;

    if (cEnd <= startMs) {
      next.push(clip); // entirely before the cut
      continue;
    }
    if (cStart >= endMs) {
      next.push({ ...clip, startMs: cStart - span }); // entirely after → ripple
      continue;
    }

    // Overlaps the cut: keep the head before it and the tail after it.
    const headLen = Math.max(0, startMs - cStart);
    const tailFromLocal = Math.min(clip.durationMs, endMs - cStart);
    if (headLen > 0) next.push(headRemnant(clip, headLen));
    if (clip.durationMs - tailFromLocal > 0) {
      next.push(tailRemnant(clip, tailFromLocal, startMs));
    }
    // Neither remnant → the clip was fully covered and is dropped.
  }

  return { clips: next, durationMs: maxEnd(next) };
}

/**
 * Change a single word's text without touching its timing or media — Descript's
 * "correct the transcript without changing the audio": you are fixing the
 * label, not the timestamped media behind it.
 */
export function relabelWord(
  clips: TimelineClip[],
  clipId: string,
  wordIndex: number,
  text: string
): TimelineClip[] {
  return clips.map((c) => {
    if (c.id !== clipId || !c.caption) return c;
    if (wordIndex < 0 || wordIndex >= c.caption.words.length) return c;
    const words = c.caption.words.map((w, i) =>
      i === wordIndex ? { ...w, word: text } : w
    );
    return { ...c, caption: { ...c.caption, words } };
  });
}

/** Absolute time spans of every filler word in the projected transcript. */
function fillerRanges(clips: TimelineClip[]): Array<{ startMs: number; endMs: number }> {
  return buildTranscriptDoc(clips)
    .segments.flatMap((s) => s.tokens)
    .filter((t) => t.kind === "filler")
    .map((t) => ({ startMs: t.startMs, endMs: t.endMs }));
}

/** How many filler words the transcript currently contains. */
export function countFillers(clips: TimelineClip[]): number {
  return fillerRanges(clips).length;
}

/**
 * Ripple-cut every filler word ("um", "uh", …) in one pass. Ranges are removed
 * right-to-left so each deletion leaves the earlier (left) ranges' absolute
 * times valid — the bulk version of {@link rippleDeleteRange}.
 */
export function removeFillers(clips: TimelineClip[]): ReflowedClips {
  const ranges = fillerRanges(clips).sort((a, b) => b.startMs - a.startMs);
  let result = clips;
  let durationMs = maxEnd(clips);
  for (const range of ranges) {
    const out = rippleDeleteRange(result, range.startMs, range.endMs);
    result = out.clips;
    durationMs = out.durationMs;
  }
  return { clips: result, durationMs };
}

// ── Reconcile a freeform text edit back to the media ─────────────────────────

/** One transcript word still present in the editor, with its current text. */
export interface SurvivingWord {
  clipId: string;
  wordIndex: number;
  text: string;
}

/**
 * Reconcile a freeform edit of the transcript text back onto the clips. Given
 * the words that survived the edit (each still tagged with its source word and
 * carrying its possibly-edited text), this:
 *   1. relabels surviving words whose text changed (label only — no media move,
 *      matching Descript's "fix the transcript without changing the audio"),
 *   2. ripple-cuts the words that were deleted from the text (right-to-left so
 *      the earlier ranges stay valid as the later ones are removed).
 * New text typed between words is folded into the adjacent word upstream (so it
 * arrives here as a relabel); authoring brand-new audio stays an explicit
 * "add line" → voice action.
 */
export function reconcileTranscript(
  clips: TimelineClip[],
  survivors: SurvivingWord[]
): ReflowedClips {
  const doc = buildTranscriptDoc(clips);
  const tokens = doc.segments.flatMap((s) => s.tokens);
  const key = (clipId: string, wordIndex: number): string =>
    `${clipId}:${wordIndex}`;
  const survivingText = new Map(
    survivors.map((s) => [key(s.clipId, s.wordIndex), s.text])
  );

  // 1. Relabels (geometry unchanged, so token times stay valid for step 2).
  let next = clips;
  for (const tok of tokens) {
    const edited = survivingText.get(key(tok.clipId, tok.wordIndex));
    if (edited === undefined) continue;
    const trimmed = edited.trim();
    if (trimmed && trimmed !== tok.text) {
      next = relabelWord(next, tok.clipId, tok.wordIndex, trimmed);
    }
  }

  // 2. Ripple-cut removed words, latest first.
  const removed = tokens
    .filter((tok) => !survivingText.has(key(tok.clipId, tok.wordIndex)))
    .map((tok) => ({ startMs: tok.startMs, endMs: tok.endMs }))
    .sort((a, b) => b.startMs - a.startMs);

  let durationMs = doc.durationMs;
  for (const range of removed) {
    const out = rippleDeleteRange(next, range.startMs, range.endMs);
    next = out.clips;
    durationMs = out.durationMs;
  }

  return { clips: next, durationMs };
}

/** The structured result of reading a freeform edit out of the editor. */
export interface EditorEdits {
  /** Voiced words still present, with their (possibly edited) text. */
  survivors: SurvivingWord[];
  /** Existing draft beats still present, with their current prompt text. */
  draftUpdates: Array<{ clipId: string; text: string }>;
  /** Text in word-less, draft-less paragraphs — brand-new lines to author. */
  newDraftTexts: string[];
}

/** Whether a clip is an un-voiced authored beat (a draft awaiting voicing). */
function isDraftBeat(clip: TimelineClip): boolean {
  return isVoiceoverBeat(clip) && !hasWords(clip);
}

/**
 * Apply a whole freeform edit to the clips in one transform: reconcile voiced
 * words (relabel + ripple-cut), update existing draft prompts, drop drafts
 * whose text was deleted, create draft beats for newly-typed lines, then re-flow.
 * Returns the same array when nothing changed.
 */
export function applyEditorEdits(
  clips: TimelineClip[],
  edits: EditorEdits,
  audioTrackId: string
): ReflowedClips {
  let next = reconcileTranscript(clips, edits.survivors).clips;

  // Existing drafts: write back the edited prompt.
  const updateById = new Map(edits.draftUpdates.map((d) => [d.clipId, d.text.trim()]));
  next = next.map((c) =>
    updateById.has(c.id) && (c.prompt ?? "") !== updateById.get(c.id)
      ? { ...c, prompt: updateById.get(c.id) }
      : c
  );

  // Drafts whose text was deleted entirely are removed.
  const kept = new Set(edits.draftUpdates.map((d) => d.clipId));
  const removed = new Set(
    clips.filter(isDraftBeat).map((c) => c.id).filter((id) => !kept.has(id))
  );
  if (removed.size > 0) next = next.filter((c) => !removed.has(c.id));

  // Newly-typed lines become draft beats to voice.
  for (const text of edits.newDraftTexts) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const id = createTimeOrderedUuid();
    next = [
      ...next,
      makeClip({
        id,
        paragraphId: id,
        name: trimmed.slice(0, 40),
        trackId: audioTrackId,
        startMs: maxEnd(next),
        durationMs: PLACEHOLDER_BEAT_MS,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: trimmed,
        status: "draft"
      })
    ];
  }

  return reflowGenerated(next);
}

// ── Move (cut / paste a word range) ──────────────────────────────────────────

export interface CutResult extends ReflowedClips {
  /** The removed media as standalone, 0-based clips ready to paste elsewhere. */
  extracted: TimelineClip[];
}

/** The middle slice of `clip` (clip-local [loMs, hiMs)), placed at `blockMs`. */
function midRemnant(
  clip: TimelineClip,
  loMs: number,
  hiMs: number,
  blockMs: number
): TimelineClip {
  const inPointMs = clip.inPointMs ?? 0;
  const words = (clip.caption?.words ?? [])
    .filter((w) => w.startMs >= loMs && w.endMs <= hiMs)
    .map((w) => ({ ...w, startMs: w.startMs - loMs, endMs: w.endMs - loMs }));
  return {
    ...clip,
    id: createTimeOrderedUuid(),
    startMs: blockMs,
    durationMs: hiMs - loMs,
    inPointMs: inPointMs + loMs,
    outPointMs: inPointMs + hiMs,
    caption: clip.caption ? { ...clip.caption, words } : undefined
  };
}

/**
 * Ripple-delete [startMs, endMs) like {@link rippleDeleteRange}, but also return
 * the removed media as a 0-based block of clips — the "cut" half of a move.
 */
export function cutWordRange(
  clips: TimelineClip[],
  startMs: number,
  endMs: number
): CutResult {
  if (endMs <= startMs) {
    return { clips, durationMs: maxEnd(clips), extracted: [] };
  }
  const extracted: TimelineClip[] = [];
  for (const clip of clips) {
    const cStart = clip.startMs;
    const cEnd = clip.startMs + clip.durationMs;
    const lo = Math.max(cStart, startMs);
    const hi = Math.min(cEnd, endMs);
    if (hi <= lo) continue;
    extracted.push(midRemnant(clip, lo - cStart, hi - cStart, lo - startMs));
  }
  extracted.sort(byTimeline);
  const removed = rippleDeleteRange(clips, startMs, endMs);
  return { clips: removed.clips, durationMs: removed.durationMs, extracted };
}

/**
 * Ripple-insert a 0-based `block` of clips at `targetMs`: clips at or after the
 * target shift right by the block length (splitting any clip straddling it),
 * then the block is placed at the target. The paste half of a move.
 */
export function pasteClipsAt(
  clips: TimelineClip[],
  targetMs: number,
  block: TimelineClip[]
): ReflowedClips {
  if (block.length === 0) return { clips, durationMs: maxEnd(clips) };
  const blockLen = block.reduce((m, c) => Math.max(m, c.startMs + c.durationMs), 0);
  const next: TimelineClip[] = [];

  for (const clip of clips) {
    const cStart = clip.startMs;
    const cEnd = clip.startMs + clip.durationMs;
    if (cEnd <= targetMs) {
      next.push(clip);
    } else if (cStart >= targetMs) {
      next.push({ ...clip, startMs: cStart + blockLen });
    } else {
      const headLen = targetMs - cStart;
      next.push(headRemnant(clip, headLen));
      next.push(tailRemnant(clip, headLen, targetMs + blockLen));
    }
  }

  for (const b of block) {
    next.push({ ...b, id: createTimeOrderedUuid(), startMs: b.startMs + targetMs });
  }

  return { clips: next, durationMs: maxEnd(next) };
}

/**
 * Move the word span [startMs, endMs) to `targetMs` (a word boundary): cut it
 * out, close the gap, then paste it at the target — "cut a paragraph and paste
 * it earlier, the media follows the text". The target is taken in the original
 * coordinate space and adjusted for the gap the cut closes.
 */
export function moveWordRange(
  clips: TimelineClip[],
  startMs: number,
  endMs: number,
  targetMs: number
): ReflowedClips {
  if (targetMs >= startMs && targetMs <= endMs) {
    return { clips, durationMs: maxEnd(clips) }; // dropping inside the cut → no-op
  }
  const cut = cutWordRange(clips, startMs, endMs);
  const adjustedTarget = targetMs > endMs ? targetMs - (endMs - startMs) : targetMs;
  return pasteClipsAt(cut.clips, adjustedTarget, cut.extracted);
}

// ── Migration: legacy line/caption-clip model → clip-sourced captions ─────────

/**
 * One-time, idempotent migration from the legacy transcript model (a
 * `TranscriptLine[]` binding a voiceover audio clip + a separate caption clip)
 * to the clip-sourced model (words carried directly by the voiceover clip).
 *
 * For each line: fold the bound caption clip's words onto the voiceover audio
 * clip and drop the now-redundant caption clip. A line that was typed but never
 * voiced (no audio clip) becomes a draft voiceover beat on `audioTrackId` so
 * its text survives. Run only when `transcript` is non-empty; callers clear the
 * `transcript` field afterwards since clips are now the source of truth.
 */
export function migrateTranscriptToClips(
  transcript: TranscriptLine[],
  clips: TimelineClip[],
  audioTrackId: string
): TimelineClip[] {
  if (transcript.length === 0) return clips;

  const byId = new Map(clips.map((c) => [c.id, c]));
  const patched = new Map<string, TimelineClip>();
  const removeIds = new Set<string>();
  const created: TimelineClip[] = [];

  for (const line of transcript) {
    const bound = line.clipIds
      .map((id) => byId.get(id))
      .filter((c): c is TimelineClip => c !== undefined);
    const audio = bound.find((c) => c.mediaType === "audio");
    const caption = bound.find((c) => c.caption !== undefined);

    if (audio) {
      const base = patched.get(audio.id) ?? audio;
      patched.set(audio.id, {
        ...base,
        caption: hasWords(base) ? base.caption : caption?.caption ?? base.caption,
        prompt: base.prompt || line.text,
        paragraphId: base.paragraphId ?? base.id
      });
      if (caption) removeIds.add(caption.id);
    } else if (line.text.trim()) {
      const id = createTimeOrderedUuid();
      created.push(
        makeClip({
          id,
          paragraphId: id,
          name: line.text.slice(0, 40).trim() || "Voiceover",
          trackId: audioTrackId,
          startMs: line.beatStartMs,
          durationMs: PLACEHOLDER_BEAT_MS,
          mediaType: "audio",
          sourceType: "generated",
          bindingKind: "text-to-audio",
          prompt: line.text,
          status: "draft"
        })
      );
    }
  }

  const next = clips
    .filter((c) => !removeIds.has(c.id))
    .map((c) => patched.get(c.id) ?? c);
  return [...next, ...created];
}
