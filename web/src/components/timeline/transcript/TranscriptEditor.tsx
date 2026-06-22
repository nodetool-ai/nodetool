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
  type EditorEdits
} from "../../../stores/timeline/transcriptOps";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  useTimelineUIStoreApi,
  useTimelinePlaybackStoreApi
} from "../../../stores/timeline/TimelineInstance";
import { MOTION, FONT_SIZE_SANS, BORDER_RADIUS } from "../../ui_primitives";
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

// ── Plugins ──────────────────────────────────────────────────────────────────

/**
 * Owns the model↔editor sync. Re-seeds the editor from the clips when their
 * word content changes externally (and the editor is unfocused); reconciles the
 * editor back onto the clips on blur.
 */
const SyncPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const clips = useTimelineStore((s) => s.clips);
  const markers = useTimelineStore((s) => s.markers);
  const setTranscriptAndClips = useTimelineStore((s) => s.setTranscriptAndClips);

  const focusedRef = useRef(false);
  const seededClipsRef = useRef<TimelineClip[]>(clips);
  const seededSigRef = useRef<string>("");
  const seededMarkerSigRef = useRef<string>("");

  const reseed = useCallback(
    (nextClips: TimelineClip[], nextMarkers: TimelineMarker[]) => {
      editor.update(
        () => $seedFromClips(nextClips, nextMarkers),
        { discrete: true }
      );
      seededClipsRef.current = nextClips;
      seededSigRef.current = transcriptSignature(nextClips);
      seededMarkerSigRef.current = markerSignature(nextMarkers);
    },
    [editor]
  );

  // Re-seed when the model changes from outside the editor while it is unfocused
  // — word content (generate / import / load / undo) or scene markers (a "/ New
  // scene" command, or a removed break). The initial seed is done by
  // `initialConfig.editorState`; this also fires on mount to capture
  // `seededClipsRef` for the blur reconcile.
  useEffect(() => {
    if (focusedRef.current) return;
    const sig = transcriptSignature(clips);
    const msig = markerSignature(markers);
    if (sig !== seededSigRef.current || msig !== seededMarkerSigRef.current) {
      reseed(clips, markers);
    }
  }, [clips, markers, reseed]);

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
      const base = seededClipsRef.current;

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
 * re-renders per frame. The subscription also fires on discrete seek/scrub/stop
 * (they all emit on the same channel), and we apply once on mount / when the
 * word DOM changes (load / generate / reseed) so the highlight is correct at
 * rest too.
 */
const ActiveWordPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const playbackApi = useTimelinePlaybackStoreApi();
  const clips = useTimelineStore((s) => s.clips);
  const lastActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const apply = (timeMs: number): void => {
      const root = editor.getRootElement();
      if (!root) return;
      let next: HTMLElement | null = null;
      for (const el of root.querySelectorAll<HTMLElement>(".transcript-word")) {
        const start = Number(el.dataset.start);
        const end = Number(el.dataset.end);
        if (timeMs >= start && timeMs < end) {
          next = el;
          break;
        }
      }
      if (next === lastActive.current) return;
      lastActive.current?.classList.remove("is-active");
      if (next) {
        next.classList.add("is-active");
        next.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
      lastActive.current = next;
    };

    apply(playbackApi.getState().getTimeMs());
    return playbackApi.getState().subscribeTime(apply);
  }, [editor, playbackApi, clips]);

  return null;
};

/**
 * A caret shown in Script mode (where the read-only editor has no native one).
 * It sweeps across the active word as the playhead advances, sits at the next
 * word boundary when paused between words, and lands wherever a click/arrow seek
 * moves the playhead — so there's always a cursor moving across the words. Word
 * offsets are relative to `.transcript-editor-area` (its `position: relative`
 * makes it the words' offsetParent), so the caret positions in the same space.
 */
const ScriptCaretPlugin: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [editor] = useLexicalComposerContext();
  const playbackApi = useTimelinePlaybackStoreApi();
  // Re-run when the projected words change (load / generate / reseed), not just
  // when the playhead moves — otherwise the caret wouldn't appear until a seek.
  const clips = useTimelineStore((s) => s.clips);
  const caretRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const caret = caretRef.current;
    if (!caret) return;

    // Sweep the caret across the active word as the playhead advances. Driven
    // imperatively off the transient time channel (~60×/s during playback) and
    // off discrete seek/scrub — no React state, so zero per-frame re-renders.
    const apply = (timeMs: number): void => {
      const root = editor.getRootElement();
      if (!visible || !root) {
        caret.style.display = "none";
        return;
      }

      const words = [...root.querySelectorAll<HTMLElement>(".transcript-word")];
      if (words.length === 0) {
        caret.style.display = "none";
        return;
      }

      let target: HTMLElement | null = null;
      let fraction = 0;
      for (const el of words) {
        const start = Number(el.dataset.start);
        const end = Number(el.dataset.end);
        if (timeMs >= start && timeMs < end) {
          target = el;
          // The enclosing check guarantees start <= timeMs < end, so end > start
          // and the denominator is always positive.
          fraction = (timeMs - start) / (end - start);
          break;
        }
      }
      // Between words / paused: sit at the next word's start, else after the last.
      if (!target) {
        target =
          words.find((el) => Number(el.dataset.start) >= timeMs) ?? null;
        if (!target) {
          const last = words[words.length - 1];
          caret.style.display = "block";
          caret.style.left = `${last.offsetLeft + last.offsetWidth}px`;
          caret.style.top = `${last.offsetTop}px`;
          caret.style.height = `${last.offsetHeight}px`;
          return;
        }
      }

      caret.style.display = "block";
      caret.style.left = `${target.offsetLeft + fraction * target.offsetWidth}px`;
      caret.style.top = `${target.offsetTop}px`;
      caret.style.height = `${target.offsetHeight}px`;
    };

    apply(playbackApi.getState().getTimeMs());
    return playbackApi.getState().subscribeTime(apply);
  }, [editor, playbackApi, visible, clips]);

  return <div ref={caretRef} className="script-caret" aria-hidden="true" />;
};

/**
 * Mirrors the timeline's clip selection into the transcript: every word of a
 * selected clip gets `.is-selected`, so clicking a word (which selects its
 * clip) highlights here, and selecting a clip on the timeline highlights its
 * words. A DOM class toggle — no editor-state change.
 */
const SelectionHighlightPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    for (const el of root.querySelectorAll<HTMLElement>(".transcript-word")) {
      el.classList.toggle(
        "is-selected",
        selectedClipIds.has(el.dataset.clip ?? "")
      );
    }
  }, [editor, selectedClipIds]);

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
    marginLeft: -1,
    background: theme.vars.palette.primary.main,
    borderRadius: BORDER_RADIUS.xs,
    pointerEvents: "none",
    zIndex: 1,
    animation: "transcript-caret-blink 1.1s step-end infinite"
  },
  "@keyframes transcript-caret-blink": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0 }
  },
  "& p": { margin: "0 0 8px" },
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
        // caret moves across words).
        const root = editor.getRootElement();
        if (!root) return;
        const starts = [...root.querySelectorAll<HTMLElement>(".transcript-word")]
          .map((el) => Number(el.dataset.start))
          .filter((n) => Number.isFinite(n))
          .sort((a, b) => a - b);
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
  }, [writing, togglePlay, openSlashCommand, editor, playbackApi]);

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
        <SyncPlugin />
        <CaretSeekPlugin />
        <ActiveWordPlugin />
        <ScriptCaretPlugin visible={!writing} />
        <SelectionHighlightPlugin />
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
