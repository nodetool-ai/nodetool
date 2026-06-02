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
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CheckIcon from "@mui/icons-material/Check";

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
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW
} from "lexical";

import { WordNode, $createWordNode, $isWordNode } from "./WordNode";
import { DraftNode, $createDraftNode, $isDraftNode } from "./DraftNode";
import {
  applyEditorEdits,
  buildTranscriptDoc,
  type EditorEdits
} from "../../../stores/timeline/transcriptOps";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelinePlaybackStore } from "../../../stores/timeline/TimelinePlaybackStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { EditorButton, FlexRow, Caption, SPACING } from "../../ui_primitives";
import type { TimelineClip } from "@nodetool-ai/timeline";

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

/** Rebuild the editor tree from the projected transcript. */
function $seedFromClips(clips: TimelineClip[]): void {
  const root = $getRoot();
  root.clear();
  const doc = buildTranscriptDoc(clips);
  if (doc.segments.length === 0) {
    root.append($createParagraphNode());
    return;
  }
  for (const segment of doc.segments) {
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
  const setTranscriptAndClips = useTimelineStore((s) => s.setTranscriptAndClips);

  const focusedRef = useRef(false);
  const seededClipsRef = useRef<TimelineClip[]>(clips);
  const seededSigRef = useRef<string>("");

  const reseed = useCallback(
    (next: TimelineClip[]) => {
      editor.update(
        () => $seedFromClips(next),
        { discrete: true }
      );
      seededClipsRef.current = next;
      seededSigRef.current = transcriptSignature(next);
    },
    [editor]
  );

  // Re-seed when the model's word content changes from outside the editor
  // (generate / import / load / undo) while it is unfocused. The initial seed
  // is done by `initialConfig.editorState`; this also fires on mount to capture
  // `seededClipsRef` for the blur reconcile.
  useEffect(() => {
    if (focusedRef.current) return;
    const sig = transcriptSignature(clips);
    if (sig !== seededSigRef.current) reseed(clips);
  }, [clips, reseed]);

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

/** Highlights (and scrolls to) the word under the playhead during playback. */
const ActiveWordPlugin: React.FC = () => {
  const [editor] = useLexicalComposerContext();
  const currentTimeMs = useTimelinePlaybackStore((s) => s.currentTimeMs);
  const lastActive = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    let next: HTMLElement | null = null;
    for (const el of root.querySelectorAll<HTMLElement>(".transcript-word")) {
      const start = Number(el.dataset.start);
      const end = Number(el.dataset.end);
      if (currentTimeMs >= start && currentTimeMs < end) {
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
  }, [editor, currentTimeMs]);

  return null;
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
  borderRadius: 6,
  background: theme.vars.palette.background.default,
  color: theme.vars.palette.text.primary,
  padding: "8px 12px 10px",
  fontSize: 14,
  lineHeight: 1.95,
  outline: "none",
  transition: "border-color 120ms ease, box-shadow 120ms ease",
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
  "& p": { margin: "0 0 8px" },
  "& p:last-child": { marginBottom: 0 },
  "& .transcript-word": {
    borderRadius: 3,
    transition: "background-color 80ms ease, color 80ms ease"
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
    backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.26)`
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const writing = mode === "write";

  // Editability + focus follow the mode. Leaving Write blurs the editor, which
  // triggers the SyncPlugin reconcile.
  useEffect(() => {
    editor.setEditable(writing);
    const root = editor.getRootElement();
    if (writing) root?.focus();
    else {
      root?.blur();
      surfaceRef.current?.focus();
    }
  }, [editor, writing]);

  const togglePlay = useCallback(() => {
    const pb = useTimelinePlaybackStore.getState();
    if (pb.isPlaying) pb.pause();
    else pb.play();
  }, []);

  const dropSceneMarker = useCallback(() => {
    const { currentTimeMs } = useTimelinePlaybackStore.getState();
    const store = useTimelineStore.getState();
    store.addMarker(currentTimeMs, `Scene ${store.markers.length + 1}`);
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (writing) {
        if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          togglePlay();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setMode("script");
        }
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "/") {
        e.preventDefault();
        dropSceneMarker();
      }
    },
    [writing, setMode, togglePlay, dropSceneMarker]
  );

  // Focus the surface on press (before the click) so single-letter commands are
  // captured in Script mode; skip when pressing a control like the Write button.
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (writing) return;
      if ((e.target as HTMLElement).closest("button")) return;
      surfaceRef.current?.focus();
    },
    [writing]
  );

  const onClick = useCallback((e: React.MouseEvent) => {
    const word = (e.target as HTMLElement).closest?.(
      ".transcript-word"
    ) as HTMLElement | null;
    if (!word) return;
    const start = Number(word.dataset.start);
    if (Number.isFinite(start)) {
      useTimelinePlaybackStore.getState().seek(start);
    }
    // Selecting the clip highlights it here and on the timeline (bidirectional).
    if (word.dataset.clip) {
      useTimelineUIStore.getState().setSelection([word.dataset.clip]);
    }
  }, []);

  return (
    <EditorSurface
      ref={surfaceRef}
      tabIndex={0}
      className={writing ? "is-writing" : undefined}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onClick={onClick}
      data-testid="transcript-surface"
    >
      <FlexRow justify="space-between" align="center" sx={{ mb: SPACING.xs }}>
        <Caption sx={{ color: "text.disabled" }}>
          {writing
            ? "Writing — ⌘S plays · Esc to finish"
            : "Click a word to jump · Space plays · / marks a scene"}
        </Caption>
        <EditorButton
          size="small"
          variant={writing ? "contained" : "outlined"}
          startIcon={
            writing ? (
              <CheckIcon fontSize="small" />
            ) : (
              <EditOutlinedIcon fontSize="small" />
            )
          }
          onClick={(e) => {
            e.stopPropagation();
            setMode(writing ? "script" : "write");
          }}
        >
          {writing ? "Done writing" : "Write"}
        </EditorButton>
      </FlexRow>

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
      nodes: [WordNode, DraftNode],
      editable: false,
      editorState: () => $seedFromClips(useTimelineStore.getState().clips),
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
