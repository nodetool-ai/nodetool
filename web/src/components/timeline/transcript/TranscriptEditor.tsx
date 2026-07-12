/**
 * TranscriptEditor — the transcript as a single freeform contentEditable.
 *
 * Words are {@link WordNode}s (editable text carrying their media binding), so
 * the whole script is one text editor you can type, select, and delete in
 * natively. The model sync is deliberately edge-light:
 *
 *   - While the editor is focused it is the source of truth — nothing rewrites
 *     it, so the caret never fights a re-render.
 *   - On blur the edit is reconciled back onto the clips (relabel changed
 *     words, ripple-cut deleted ones) via `reconcileTranscript`.
 *   - When the model changes from elsewhere (generate / import / load / undo)
 *     while the editor is unfocused, it re-seeds from the model.
 *
 * Caret-in-a-word seeks the shared playhead; the spoken word highlights live as
 * it plays. New narration is authored with "Add line" (a draft beat to voice),
 * not by free-typing audio into existence — text typed between words folds into
 * the adjacent word as a label correction.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { styled } from "@mui/material/styles";

import { LexicalComposer } from "@lexical/react/LexicalComposer";
import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $getSelection,
  $nodesOfType,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW
} from "lexical";

import { useShallow } from "zustand/react/shallow";

import { WordNode, $createWordNode, $isWordNode } from "./WordNode";
import { DraftNode, $createDraftNode, $isDraftNode } from "./DraftNode";
import {
  SlashCommandNode,
  $createSlashCommandNode
} from "./SlashCommandNode";
import {
  SceneBreakNode,
  $createSceneBreakNode
} from "./SceneBreakNode";
import {
  applyEditorEdits,
  buildTranscriptDoc,
  isTranscriptClip,
  type EditorEdits
} from "../../../stores/timeline/transcriptOps";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  useTimelineUIStoreApi,
  useTimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelineInstance";
import { MOTION, FONT_SIZE_SANS, BORDER_RADIUS, SPACING, getSpacingPx, Z_INDEX } from "../../ui_primitives";
import type { TimelineClip, TimelineMarker } from "@nodetool-ai/timeline";

type EditorMode = "script" | "write";

// ── Editor-state <-> clips bridge ($-helpers, run inside read/update) ─────────

/** A stable signature of the transcript's word content, to detect external edits. */
function transcriptSignature(clips: TimelineClip[]): string {
  return buildTranscriptDoc(clips)
    .segments.map(
      (s) =>
        `${s.id}:${s.isDraft ? `d=${s.draftText}` : s.tokens.map((t) => `${t.wordIndex}=${t.text}@${t.startMs}-${t.endMs}`).join(",")}`
    )
    .join("|");
}

/** Stable signature of the scene markers, to detect external add/remove. */
function markerSignature(markers: TimelineMarker[]): string {
  return [...markers]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((m) => `${m.id}@${m.timeMs}`)
    .join("|");
}

/**
 * Rebuild the editor tree from the projected transcript, interleaving scene
 * breaks projected from the markers (block dividers placed by time). Markers are
 * the source of truth, so the breaks survive a reseed; removing a break removes
 * its marker (see {@link SceneBreakNode}).
 */
function $seedFromClips(clips: TimelineClip[], markers: TimelineMarker[]): void {
  const root = $getRoot();
  root.clear();
  const doc = buildTranscriptDoc(clips);

  const ordered = [...markers].sort((a, b) => a.timeMs - b.timeMs);
  let mi = 0;
  const placeMarkersUpTo = (timeMs: number): void => {
    while (mi < ordered.length && ordered[mi].timeMs <= timeMs) {
      const marker = ordered[mi];
      root.append(
        $createSceneBreakNode(marker.id, marker.label || `Scene ${mi + 1}`)
      );
      mi++;
    }
  };

  if (doc.segments.length === 0) {
    placeMarkersUpTo(Infinity);
    if (root.getChildrenSize() === 0) root.append($createParagraphNode());
    return;
  }
  for (const segment of doc.segments) {
    placeMarkersUpTo(segment.startMs);
    const paragraph = $createParagraphNode();
    if (segment.isDraft) {
      if (segment.draftText) {
        paragraph.append($createDraftNode(segment.draftText, segment.clipIds[0]));
      }
    } else {
      segment.tokens.forEach((token, i) => {
        if (i > 0) paragraph.append($createTextNode(" "));
        paragraph.append(
          $createWordNode(token.text, {
            clipId: token.clipId,
            wordIndex: token.wordIndex,
            startMs: token.startMs,
            endMs: token.endMs,
            wordKind: token.kind
          })
        );
      });
    }
    root.append(paragraph);
  }
  placeMarkersUpTo(Infinity);
}

/**
 * Read the freeform edit out of the editor as structured edits. A paragraph
 * with words yields surviving words (stray text folds into the adjacent word);
 * a paragraph with a draft node yields a draft prompt update; an otherwise
 * plain paragraph with text is a brand-new line to author.
 */
function $extractEdits(): EditorEdits {
  const survivors: EditorEdits["survivors"] = [];
  const draftUpdates: EditorEdits["draftUpdates"] = [];
  const newDraftTexts: EditorEdits["newDraftTexts"] = [];

  for (const block of $getRoot().getChildren()) {
    if (!$isElementNode(block)) continue;
    const children = block.getChildren();
    const draftNode = children.find($isDraftNode);

    if (children.some($isWordNode)) {
      let current: EditorEdits["survivors"][number] | null = null;
      for (const child of children) {
        if ($isWordNode(child)) {
          if (current) survivors.push(current);
          current = {
            clipId: child.getClipId(),
            wordIndex: child.getWordIndex(),
            text: child.getTextContent()
          };
        } else if ($isTextNode(child)) {
          const text = child.getTextContent().trim();
          if (text && current) current.text = `${current.text} ${text}`;
        }
      }
      if (current) survivors.push(current);
    } else if (draftNode) {
      draftUpdates.push({
        clipId: draftNode.getClipId(),
        text: block.getTextContent()
      });
    } else {
      const text = block.getTextContent().trim();
      if (text) newDraftTexts.push(text);
    }
  }

  return { survivors, draftUpdates, newDraftTexts };
}

// ── Shared word index (F4: one DOM pass feeds every per-tick plugin) ─────────

/** One rendered `.transcript-word` span, with its timing and cached layout. */
interface TranscriptWordEntry {
  el: HTMLElement;
  clipId: string;
  /** Absolute timeline start/end, parsed once from `data-start`/`data-end`. */
  startMs: number;
  endMs: number;
  /** Layout relative to `.transcript-editor-area`, read once per rebuild so
   *  per-tick consumers (the caret) never force a reflow. */
  offsetLeft: number;
  offsetTop: number;
  offsetWidth: number;
  offsetHeight: number;
}

/**
 * A sorted-by-time index over every `.transcript-word` span in the editor,
 * rebuilt from a single `querySelectorAll` + one dataset/layout read pass.
 * `ActiveWordPlugin`, `ScriptCaretPlugin`, `SelectionHighlightPlugin`, and the
 * arrow-key word-stepping in `EditorBody` all read from one instance instead
 * of each re-querying and re-parsing the whole word DOM on every 60 Hz time
 * tick. `findActive`/`findNextStart` binary-search the sorted entries.
 */
class TranscriptWordIndex {
  private entries: TranscriptWordEntry[] = [];
  private listeners = new Set<() => void>();

  /** Re-scan the DOM. Call after any change that can move or replace words. */
  rebuild(root: HTMLElement | null): void {
    if (!root) {
      this.entries = [];
    } else {
      const next: TranscriptWordEntry[] = [];
      // Document order out of `querySelectorAll` is already chronological
      // (words render left-to-right, time-ordered), so no separate sort is
      // needed.
      root.querySelectorAll<HTMLElement>(".transcript-word").forEach((el) => {
        const startMs = Number(el.dataset.start);
        const endMs = Number(el.dataset.end);
        if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
        next.push({
          el,
          clipId: el.dataset.clip ?? "",
          startMs,
          endMs,
          offsetLeft: el.offsetLeft,
          offsetTop: el.offsetTop,
          offsetWidth: el.offsetWidth,
          offsetHeight: el.offsetHeight
        });
      });
      this.entries = next;
    }
    this.listeners.forEach((cb) => cb());
  }

  /**
   * Notified after every `rebuild()` (content or layout changed). Plugins that
   * must reflect the words as soon as they appear — not just on the next time
   * tick — subscribe here in addition to the playback time channel (mirrors
   * why the pre-index code re-ran its whole effect on every `clips` change).
   */
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  get size(): number {
    return this.entries.length;
  }

  get all(): readonly TranscriptWordEntry[] {
    return this.entries;
  }

  at(index: number): TranscriptWordEntry | null {
    return this.entries[index] ?? null;
  }

  /** The word spanning `timeMs` (`start <= timeMs < end`), or null between words. */
  findActive(timeMs: number): TranscriptWordEntry | null {
    const entries = this.entries;
    let lo = 0;
    let hi = entries.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const entry = entries[mid];
      if (timeMs < entry.startMs) hi = mid - 1;
      else if (timeMs >= entry.endMs) lo = mid + 1;
      else return entry;
    }
    return null;
  }

  /** The first word starting at or after `timeMs`, or null if none remain. */
  findNextStart(timeMs: number): TranscriptWordEntry | null {
    const entries = this.entries;
    let lo = 0;
    let hi = entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (entries[mid].startMs >= timeMs) hi = mid;
      else lo = mid + 1;
    }
    return lo < entries.length ? entries[lo] : null;
  }
}

// ── Plugins ──────────────────────────────────────────────────────────────────

/** Cooldown window (ms) on the reseed signature check — see the effect below. */
const RESEED_DEBOUNCE_MS = 150;

/**
 * Owns the model↔editor sync. Re-seeds the editor from the clips when their
 * word content changes externally (and the editor is unfocused); reconciles the
 * editor back onto the clips on blur.
 */
const SyncPlugin: React.FC<{ wordIndex: TranscriptWordIndex }> = ({
  wordIndex
}) => {
  const [editor] = useLexicalComposerContext();
  // Only the transcript/caption-bearing subset — untouched clips (B-roll,
  // music) keep their identity across store publishes, so `useShallow` returns
  // the SAME array reference for those publishes and this effect below never
  // re-runs for them. A B-roll drag no longer touches this plugin at all.
  const clips = useTimelineStore(useShallow((s) => s.clips.filter(isTranscriptClip)));
  const markers = useTimelineStore((s) => s.markers);
  const setTranscriptAndClips = useTimelineStore((s) => s.setTranscriptAndClips);

  const focusedRef = useRef(false);
  const seededSigRef = useRef<string>("");
  const seededMarkerSigRef = useRef<string>("");
  const hasSeededRef = useRef(false);
  // A "cooldown" window after each applied check: a change that lands inside
  // it is remembered as `pendingCheckRef` instead of reseeding immediately, and
  // is caught up in one trailing call when the window elapses. A change that
  // lands outside any cooldown (mount, or a quiet period) applies immediately.
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCheckRef = useRef<(() => void) | null>(null);

  const reseed = useCallback(
    (nextClips: TimelineClip[], nextMarkers: TimelineMarker[]) => {
      editor.update(
        () => $seedFromClips(nextClips, nextMarkers),
        { discrete: true }
      );
      seededSigRef.current = transcriptSignature(nextClips);
      seededMarkerSigRef.current = markerSignature(nextMarkers);
      // `discrete: true` flushes the reconciliation synchronously, so the DOM
      // already reflects the new words — rebuild the shared index right away
      // rather than waiting for the next coalesced rebuild.
      wordIndex.rebuild(editor.getRootElement());
    },
    [editor, wordIndex]
  );

  // Re-seed when the model changes from outside the editor while it is
  // unfocused — word content (generate / import / load / undo) or scene
  // markers (a "/ New scene" command, or a removed break). A single, isolated
  // change (the common case: load / generate / undo, or a test asserting
  // synchronously) applies immediately. A burst of changes within
  // `RESEED_DEBOUNCE_MS` of each other (a caption-clip drag — identity churn
  // on every pointermove) collapses into that first immediate check plus one
  // trailing catch-up for the final state, instead of one reseed per tick.
  // Reseeding only matters while unfocused, so neither the immediate nor the
  // trailing path is user-visible as a delay.
  useEffect(() => {
    const check = () => {
      if (focusedRef.current) return;
      const sig = transcriptSignature(clips);
      const msig = markerSignature(markers);
      if (sig !== seededSigRef.current || msig !== seededMarkerSigRef.current) {
        reseed(clips, markers);
      }
    };

    if (!hasSeededRef.current) {
      hasSeededRef.current = true;
      check();
      return;
    }

    if (cooldownTimerRef.current !== null) {
      // Inside a cooldown from a recent check — remember this as the trailing
      // call; the timer below picks it up with the latest clips/markers.
      pendingCheckRef.current = check;
      return;
    }

    check();
    cooldownTimerRef.current = setTimeout(() => {
      cooldownTimerRef.current = null;
      const pending = pendingCheckRef.current;
      pendingCheckRef.current = null;
      pending?.();
    }, RESEED_DEBOUNCE_MS);
  }, [clips, markers, reseed]);

  // Cancel any cooldown timer and flush a still-pending trailing check on
  // unmount, so the last queued change in a burst isn't silently dropped.
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      pendingCheckRef.current?.();
      pendingCheckRef.current = null;
    };
  }, []);

  // Reconcile the edit on blur.
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;

    const onFocus = () => {
      focusedRef.current = true;
    };
    const onBlur = () => {
      focusedRef.current = false;
      const edits = editor.getEditorState().read(() => $extractEdits());
      // `applyEditorEdits` ripples cuts/moves across every track (B-roll
      // included), so it needs the full clip list, not the transcript subset
      // this plugin reacts to — read it fresh from the store here rather than
      // widening the reactive selection above.
      const base = useTimelineStore.getState().clips;

      // A brand-new line needs a voiceover track to land on.
      let audioTrackId =
        useTimelineStore.getState().tracks.find((t) => t.type === "audio")?.id ??
        "";
      if (!audioTrackId && edits.newDraftTexts.some((t) => t.trim())) {
        useTimelineStore.getState().addTrack("audio", "Voiceover");
        audioTrackId =
          useTimelineStore.getState().tracks.find((t) => t.type === "audio")
            ?.id ?? "";
      }

      const { clips: nextClips, durationMs } = applyEditorEdits(
        base,
        edits,
        audioTrackId
      );
      if (transcriptSignature(nextClips) !== transcriptSignature(base)) {
        setTranscriptAndClips({ clips: nextClips, durationMs });
      }
    };

    root.addEventListener("focus", onFocus);
    root.addEventListener("blur", onBlur);
    return () => {
      root.removeEventListener("focus", onFocus);
      root.removeEventListener("blur", onBlur);
    };
  }, [editor, setTranscriptAndClips]);

  return null;
};

/** Seeks the shared playhead when the caret lands inside a word. */
const CaretSeekPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const seek = useTimelinePlaybackStore((s) => s.seek);

  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            return false;
          }
          const node = selection.anchor.getNode();
          if ($isWordNode(node)) seek(node.getStartMs());
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
    [editor, seek]
  );

  return null;
};

/**
 * Highlights (and scrolls to) the word under the playhead during playback.
 *
 * The playhead advances ~60×/s during playback through the transient time
 * channel, so this subscribes to {@link subscribeTime} and toggles the
 * `.is-active` class imperatively — never via React state, so it costs zero
 * re-renders per frame. It reads the shared `wordIndex` instead of querying
 * the DOM itself, and only touches the DOM when the active word actually
 * changes between ticks.
 */
const ActiveWordPlugin: React.FC<{ wordIndex: TranscriptWordIndex }> = ({
  wordIndex
}) => {
  const playbackApi = useTimelinePlaybackStoreApi();
  const lastActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const apply = (timeMs: number): void => {
      const next = wordIndex.findActive(timeMs)?.el ?? null;
      if (next === lastActive.current) return;
      lastActive.current?.classList.remove("is-active");
      if (next) {
        next.classList.add("is-active");
        next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
      lastActive.current = next;
    };

    apply(playbackApi.getState().getTimeMs());
    const unsubscribeTime = playbackApi.getState().subscribeTime(apply);
    // Also re-apply whenever the word DOM is rebuilt (load / generate / reseed
    // / resize) — otherwise the highlight wouldn't appear until the next tick.
    const unsubscribeIndex = wordIndex.subscribe(() =>
      apply(playbackApi.getState().getTimeMs())
    );
    return () => {
      unsubscribeTime();
      unsubscribeIndex();
    };
  }, [playbackApi, wordIndex]);

  return null;
};

/**
 * A caret shown in Script mode (where the read-only editor has no native one).
 * It sweeps across the active word as the playhead advances, sits at the next
 * word boundary when paused between words, and lands wherever a click/arrow seek
 * moves the playhead — so there's always a cursor moving across the words. Word
 * offsets are relative to `.transcript-editor-area` (its `position: relative`
 * makes it the words' offsetParent), so the caret positions in the same space.
 *
 * All positioning comes from the shared `wordIndex`'s cached offsets — this
 * plugin never reads `offsetLeft`/`offsetWidth` itself, so a tick never forces
 * a layout reflow (it still writes `style.left` every tick while a word is
 * active, since the caret genuinely sweeps across it).
 */
const ScriptCaretPlugin: React.FC<{
  visible: boolean;
  wordIndex: TranscriptWordIndex;
}> = ({ visible, wordIndex }) => {
  const playbackApi = useTimelinePlaybackStoreApi();
  const caretRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caret = caretRef.current;
    if (!caret) return;

    // Sweep the caret across the active word as the playhead advances. Driven
    // imperatively off the transient time channel (~60×/s during playback) and
    // off discrete seek/scrub — no React state, so zero per-frame re-renders.
    const apply = (timeMs: number): void => {
      if (!visible || wordIndex.size === 0) {
        caret.style.display = "none";
        return;
      }

      const active = wordIndex.findActive(timeMs);
      let target = active;
      let fraction = 0;
      if (active) {
        // The enclosing check guarantees start <= timeMs < end, so end > start
        // and the denominator is always positive.
        fraction = (timeMs - active.startMs) / (active.endMs - active.startMs);
      } else {
        // Between words / paused: sit at the next word's start, else after the last.
        target = wordIndex.findNextStart(timeMs);
        if (!target) {
          target = wordIndex.at(wordIndex.size - 1);
          fraction = 1; // offsetLeft + 1 * offsetWidth == right after the word.
        }
      }
      if (!target) {
        caret.style.display = "none";
        return;
      }

      caret.style.display = "block";
      caret.style.left = `${target.offsetLeft + fraction * target.offsetWidth}px`;
      caret.style.top = `${target.offsetTop}px`;
      caret.style.height = `${target.offsetHeight}px`;
    };

    apply(playbackApi.getState().getTimeMs());
    const unsubscribeTime = playbackApi.getState().subscribeTime(apply);
    // Re-run when the word DOM is rebuilt (load / generate / reseed / resize),
    // not just when the playhead moves — otherwise the caret wouldn't appear
    // (or would sit at stale offsets) until the next tick or seek.
    const unsubscribeIndex = wordIndex.subscribe(() =>
      apply(playbackApi.getState().getTimeMs())
    );
    return () => {
      unsubscribeTime();
      unsubscribeIndex();
    };
  }, [playbackApi, visible, wordIndex]);

  return <div ref={caretRef} className="script-caret" aria-hidden="true" />;
};

/**
 * Mirrors the timeline's clip selection into the transcript: every word of a
 * selected clip gets `.is-selected`, so clicking a word (which selects its
 * clip) highlights here, and selecting a clip on the timeline highlights its
 * words. A DOM class toggle — no editor-state change. Reads the shared
 * `wordIndex` instead of re-querying the word DOM.
 */
const SelectionHighlightPlugin: React.FC<{ wordIndex: TranscriptWordIndex }> = ({
  wordIndex
}) => {
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);

  useEffect(() => {
    for (const entry of wordIndex.all) {
      entry.el.classList.toggle("is-selected", selectedClipIds.has(entry.clipId));
    }
  }, [wordIndex, selectedClipIds]);

  return null;
};

// ── Component ──────────────────────────────────────────────────────────────────

const EditorSurface = styled("div")(({ theme }) => ({
  border: `1px solid ${theme.vars.palette.divider}`,
  borderRadius: BORDER_RADIUS.md,
  background: theme.vars.palette.background.default,
  color: theme.vars.palette.text.primary,
  padding: theme.spacing(2, 3, 3),
  fontSize: FONT_SIZE_SANS.body,
  lineHeight: 1.95,
  outline: "none",
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  transition: `border-color ${MOTION.fast}, box-shadow ${MOTION.fast}`,
  "&.is-writing": {
    borderColor: theme.vars.palette.primary.main,
    boxShadow: `0 0 0 1px ${theme.vars.palette.primary.main} inset`
  },
  "& .transcript-editor-area": { position: "relative" },
  "& .transcript-content": {
    outline: "none",
    minHeight: 48,
    whiteSpace: "pre-wrap"
  },
  // Playback/navigation caret shown in Script mode (the editor has no real
  // caret there). Sweeps across the active word with the playhead.
  "& .script-caret": {
    position: "absolute",
    width: 2,
    marginLeft: `-${getSpacingPx(SPACING.micro)}`,
    background: theme.vars.palette.primary.main,
    borderRadius: BORDER_RADIUS.xs,
    pointerEvents: "none",
    zIndex: Z_INDEX.raised,
    animation: `transcript-caret-blink ${MOTION.pulse} infinite`
  },
  "@keyframes transcript-caret-blink": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0 }
  },
  "& p": { margin: `0 0 ${getSpacingPx(SPACING.md)}` },
  "& p:last-child": { marginBottom: 0 },
  "& .transcript-word": {
    borderRadius: BORDER_RADIUS.xs,
    transition: `background-color ${MOTION.fast}, color ${MOTION.fast}`
  },
  "& .transcript-word--filler": {
    color: theme.vars.palette.text.disabled,
    textDecoration: "underline dotted"
  },
  "& .transcript-draft": {
    color: theme.vars.palette.text.secondary,
    fontStyle: "italic"
  },
  "& .transcript-word.is-selected": {
    backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.34)`,
    boxShadow: `0 0 0 1px rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`
  },
  "& .transcript-word.is-active": {
    backgroundColor: theme.vars.palette.primary.main,
    color: theme.vars.palette.primary.contrastText
  },
  "& .transcript-placeholder": {
    color: theme.vars.palette.text.disabled,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    left: 0
  }
}));

/**
 * The editor body — switches between Script mode (read-only; single-letter keys
 * are commands, click seeks) and Write mode (editable, blue border; ⌘S plays,
 * Esc finishes). Lives inside the composer so it can drive the editor.
 */
const EditorBody: React.FC<{
  mode: EditorMode;
  setMode: (mode: EditorMode) => void;
}> = ({ mode, setMode }) => {
  const [editor] = useLexicalComposerContext();
  const writing = mode === "write";

  // One shared index over the rendered `.transcript-word` DOM (F4): every
  // per-tick plugin below reads it instead of each re-querying and
  // re-parsing the whole word DOM 60×/s. Created once and never replaced —
  // plugins receive the same instance for the component's lifetime.
  const wordIndexRef = useRef<TranscriptWordIndex | null>(null);
  if (!wordIndexRef.current) wordIndexRef.current = new TranscriptWordIndex();
  const wordIndex = wordIndexRef.current;

  // Imperative handles to *this* instance's stores. We deliberately avoid the
  // `useTimelineStore.getState()` statics: those route to whichever timeline is
  // "active" on the activation stack, which is a *different* instance whenever a
  // player/preview is also mounted. Binding seek / select / markers to the
  // surrounding instance keeps them acting on the timeline the user is looking
  // at, so click → highlight and the command keys actually land.
  const playbackApi = useTimelinePlaybackStoreApi();
  const uiApi = useTimelineUIStoreApi();

  // Editability follows the mode. Leaving Write blurs the editor, which triggers
  // the SyncPlugin reconcile.
  useEffect(() => {
    editor.setEditable(writing);
    const root = editor.getRootElement();
    if (writing) root?.focus();
    else root?.blur();
  }, [editor, writing]);

  // Keep the word index current. `registerUpdateListener` fires for every
  // editor update (typing, node changes, and `SyncPlugin`'s reseeds); coalesce
  // bursts of those into one rebuild per animation frame. The `ResizeObserver`
  // catches layout-only changes (e.g. text wrapping shifts offsets without any
  // editor update).
  useEffect(() => {
    wordIndex.rebuild(editor.getRootElement());

    let rafId: number | null = null;
    const scheduleRebuild = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        wordIndex.rebuild(editor.getRootElement());
      });
    };

    const unregisterUpdateListener = editor.registerUpdateListener(() => {
      scheduleRebuild();
    });

    const root = editor.getRootElement();
    const resizeObserver = new ResizeObserver(() => scheduleRebuild());
    if (root) resizeObserver.observe(root);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      unregisterUpdateListener();
      resizeObserver.disconnect();
    };
  }, [editor, wordIndex]);

  const togglePlay = useCallback(() => {
    const pb = playbackApi.getState();
    if (pb.isPlaying) pb.pause();
    else pb.play();
  }, [playbackApi]);

  // Insert the inline "/" command affordance (chip + query + menu). Works in
  // both modes: in Script mode there's no caret, so it appends to the last
  // paragraph; in Write mode it lands at the caret. Guarded so only one is open.
  const openSlashCommand = useCallback(() => {
    editor.update(() => {
      if ($nodesOfType(SlashCommandNode).length > 0) return;
      const node = $createSlashCommandNode();
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.insertNodes([node]);
        return;
      }
      const root = $getRoot();
      let last = root.getLastChild();
      if (!last || !$isElementNode(last)) {
        last = $createParagraphNode();
        root.append(last);
      }
      if ($isElementNode(last)) last.append(node);
    });
  }, [editor]);

  // Script-mode commands are bound at the window — like the timeline's other
  // shortcuts (see TracksRegion) — because clicking a word doesn't move focus to
  // any one element, so a focus-scoped handler silently never fires. We bow out
  // while typing (Write mode, inputs, contentEditable — including the slash
  // command's own input) and while a control is focused, so Space still
  // activates buttons.
  useEffect(() => {
    if (writing) return;
    // Real typing targets swallow ALL command keys (so we never hijack input).
    const isTextInput = (t: EventTarget | null): boolean =>
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      t instanceof HTMLSelectElement ||
      (t instanceof HTMLElement && t.isContentEditable);
    // A focused button/link only blocks Space (so Space activates it) — "/" and
    // arrows must still fire, otherwise clicking any chip/button kills them.
    const isFocusedControl = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      t.closest('button, [role="button"], a') !== null;

    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextInput(e.target)) return;
      if (e.key === " ") {
        if (isFocusedControl(e.target)) return;
        e.preventDefault();
        togglePlay();
      } else if (e.key === "/") {
        e.preventDefault();
        openSlashCommand();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        // Step the cursor word-by-word (the playhead follows, so the Script
        // caret moves across words). Reuses the shared word index — already
        // sorted by time — instead of re-querying the word DOM.
        const starts = wordIndex.all.map((entry) => entry.startMs);
        if (starts.length === 0) return;
        e.preventDefault();
        const t = playbackApi.getState().currentTimeMs;
        const target =
          e.key === "ArrowRight"
            ? starts.find((s) => s > t + 1) ?? starts[starts.length - 1]
            : [...starts].reverse().find((s) => s < t - 1) ?? starts[0];
        playbackApi.getState().seek(target);
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [writing, togglePlay, openSlashCommand, playbackApi, wordIndex]);

  // Write-mode keys ride the editor (it holds focus): ⌘S plays, Esc finishes,
  // and "/" at the start of a block opens the command menu (mid-text "/" stays
  // a literal slash so words like "and/or" type normally).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!writing) return;
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMode("script");
      } else if (e.key === "/") {
        let atBlockStart = false;
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection) && selection.isCollapsed()) {
            atBlockStart = selection.anchor.offset === 0;
          }
        });
        if (atBlockStart) {
          e.preventDefault();
          openSlashCommand();
        }
      }
    },
    [writing, setMode, togglePlay, editor, openSlashCommand]
  );

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const word = (e.target as HTMLElement).closest?.(
        ".transcript-word"
      ) as HTMLElement | null;
      if (!word) return;
      const start = Number(word.dataset.start);
      if (Number.isFinite(start)) playbackApi.getState().seek(start);
      // Selecting the clip highlights it here and on the timeline (bidirectional).
      if (word.dataset.clip) uiApi.getState().setSelection([word.dataset.clip]);
    },
    [playbackApi, uiApi]
  );

  return (
    <EditorSurface
      className={writing ? "is-writing" : undefined}
      onKeyDown={onKeyDown}
      onClick={onClick}
      data-testid="transcript-surface"
    >
      <div className="transcript-editor-area">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="transcript-content"
              aria-label="Transcript"
              spellCheck={false}
              data-testid="transcript-editor"
            />
          }
          placeholder={
            <div className="transcript-placeholder">
              Click Write to start, or import audio to edit it as text…
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <SyncPlugin wordIndex={wordIndex} />
        <CaretSeekPlugin />
        <ActiveWordPlugin wordIndex={wordIndex} />
        <ScriptCaretPlugin visible={!writing} wordIndex={wordIndex} />
        <SelectionHighlightPlugin wordIndex={wordIndex} />
      </div>
    </EditorSurface>
  );
};

export const TranscriptEditor: React.FC = () => {
  const [mode, setMode] = useState<EditorMode>("script");

  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "TranscriptEditor",
      nodes: [WordNode, DraftNode, SlashCommandNode, SceneBreakNode],
      editable: false,
      editorState: () => {
        const state = useTimelineStore.getState();
        $seedFromClips(state.clips, state.markers);
      },
      onError: (error: Error) => {
        console.error(error);
      }
    }),
    []
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditorBody mode={mode} setMode={setMode} />
    </LexicalComposer>
  );
};

export default TranscriptEditor;
