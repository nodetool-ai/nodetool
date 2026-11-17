/**
 * Select text in the storyboard, and a prompt opens beside it: type or
 * dictate what to do with the passage. The model reads the whole board, so a
 * request like "make this match the scene's lighting" works without copying
 * anything. A proposed replacement lands as one undo step; a question gets a
 * note.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { $addUpdateTag, HISTORY_PUSH_TAG } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import type { StoryboardMarkdownEntities, StoryboardMarkdownResult } from "@nodetool-ai/protocol";

import { useStoryboardTextAssist } from "../../../hooks/storyboard/useStoryboardTextAssist";
import { VoiceInputControl } from "../../chat/composer/voice/VoiceInputControl";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  Popover,
  ScrollArea,
  Text,
  TextInput,
  ThinkingIndicator,
  ToolbarIconButton,
  BORDER_RADIUS
} from "../../ui_primitives";
import { $lines, $locateSelection, $replaceRange, type LineRange } from "./storyboardTextLines";
import type { AssistSelection } from "./storyboardTextAssist";

const PANEL_WIDTH = 420;
/** The CSS custom highlight that marks the selected passage while the prompt is open. */
export const HIGHLIGHT = "storyboard-assist";
const RESULT_MAX_HEIGHT = 260;

interface SelectionAssistPluginProps {
  boardId: string;
  result: StoryboardMarkdownResult | null;
  entities: StoryboardMarkdownEntities;
}

interface Session {
  range: LineRange;
  selection: AssistSelection;
  anchor: { top: number; left: number };
  /** Identifies the selection, so a dismissed one does not reopen on the next click. */
  signature: string;
}

const signatureOf = (range: LineRange): string => `${range.startLine}:${range.startOffset}:${range.endLine}:${range.endOffset}`;

const QUICK: Record<AssistSelection["mode"], Array<{ id: string; instruction: string }>> = {
  single: [
    { id: "tighten", instruction: "Tighten this passage. Keep every concrete visual detail and every entity mention." },
    { id: "visual", instruction: "Rewrite this passage with more concrete detail that a camera can show." },
    { id: "camera", instruction: "Propose a camera setup for this shot as - **Framing:**, - **Lens:**, - **Angle:** and - **Camera movement:** lines. Answer as a note." },
    { id: "continuity", instruction: "Check this passage against the previous and the next shot for continuity breaks: positions, light, props, cast. Answer briefly." }
  ],
  multi: [
    { id: "summarize", instruction: "Summarize what the selected lines establish for the film." },
    { id: "inconsistencies", instruction: "Find contradictions, repetition or continuity breaks inside the selection and against the rest of the board." }
  ]
};

const SelectionAssistPlugin: React.FC<SelectionAssistPluginProps> = ({ boardId, result, entities }) => {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const assist = useStoryboardTextAssist(boardId);
  const [session, setSession] = useState<Session | null>(null);
  const [instruction, setInstruction] = useState("");
  const [stale, setStale] = useState(false);
  const resultRef = useRef(result);
  resultRef.current = result;
  const dismissed = useRef<string | null>(null);
  const voiceHost = useRef<HTMLDivElement | null>(null);
  const { reset } = assist;

  const close = useCallback(
    (remember: boolean) => {
      setSession((current) => {
        dismissed.current = remember && current ? current.signature : null;
        return null;
      });
      if ("highlights" in CSS) {
        CSS.highlights.delete(HIGHLIGHT);
      }
      setInstruction("");
      setStale(false);
      reset();
    },
    [reset]
  );

  // A finished selection (mouse up, or shift+arrow released) opens the prompt.
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) {
      return;
    }
    const read = (): void => {
      const parsed = resultRef.current;
      if (!parsed) {
        return;
      }
      const located = editor.getEditorState().read(() => $locateSelection(parsed));
      if (!located) {
        dismissed.current = null;
        return;
      }
      const signature = signatureOf(located.range);
      if (signature === dismissed.current) {
        return;
      }
      const domSelection = window.getSelection();
      const range = domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null;
      // The prompt opens under the selection; without a measurable range, under the editor's top.
      const rect = range && "getBoundingClientRect" in range ? range.getBoundingClientRect() : root.getBoundingClientRect();
      setSession((current) => {
        if (current?.signature === signature) {
          return current;
        }
        setInstruction("");
        setStale(false);
        reset();
        // Keep the passage marked while focus is in the prompt.
        if (range && "highlights" in CSS && "Highlight" in window) {
          CSS.highlights.set(HIGHLIGHT, new Highlight(range.cloneRange()));
        }
        return { ...located, signature, anchor: { top: rect.bottom, left: rect.left } };
      });
    };
    const onMouseUp = (): void => {
      window.setTimeout(read, 0);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.shiftKey || event.key === "Shift") {
        read();
      }
    };
    root.addEventListener("mouseup", onMouseUp);
    root.addEventListener("keyup", onKeyUp);
    return () => {
      root.removeEventListener("mouseup", onMouseUp);
      root.removeEventListener("keyup", onKeyUp);
    };
  }, [editor, reset]);

  const submit = useCallback(
    (text: string) => {
      if (!session || !text.trim() || assist.status === "running") {
        return;
      }
      setInstruction("");
      if (assist.reply) {
        void assist.followUp(text);
        return;
      }
      // The board exactly as written: one Markdown line per editor line.
      const markdown = editor.getEditorState().read(() => $lines().map((line) => line.getTextContent()).join("\n"));
      void assist.ask({ markdown, entities, selection: session.selection, instruction: text });
    },
    [assist, editor, entities, session]
  );

  const accept = useCallback(() => {
    const reply = assist.reply;
    if (!session || !reply || reply.mode !== "replace") {
      return;
    }
    let applied = false;
    editor.update(
      () => {
        applied = $replaceRange(session.range, session.selection.text, reply.text, session.selection.heading);
        if (applied) {
          $addUpdateTag(HISTORY_PUSH_TAG);
        }
      },
      { discrete: true }
    );
    if (!applied) {
      setStale(true);
      return;
    }
    close(false);
    editor.focus();
  }, [assist.reply, close, editor, session]);

  const running = assist.status === "running";
  const reply = assist.reply;
  const quick = session ? QUICK[session.selection.mode] : [];

  return (
    <Popover
      open={session !== null}
      onClose={() => close(true)}
      anchorReference="anchorPosition"
      anchorPosition={session?.anchor}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      disableRestoreFocus
      maxWidth={PANEL_WIDTH}
      paperSx={{ width: PANEL_WIDTH, marginTop: GAP.normal }}
    >
      {session && (
        <FlexColumn ref={voiceHost} gap={GAP.normal} sx={{ padding: PADDING.normal, position: "relative" }}>
          <Caption color="primary">
            {session.selection.mode === "single" ? session.selection.scope : t("storyboardText.assist.lines", { lines: session.range.endLine - session.range.startLine + 1 })}
          </Caption>
          <Text size="small" color="secondary" lineClamp={2}>
            {session.selection.text}
          </Text>

          {reply && (
            <ScrollArea thin maxHeight={RESULT_MAX_HEIGHT} sx={{ backgroundColor: "action.hover", borderRadius: BORDER_RADIUS.md, padding: PADDING.compact }}>
              <FlexColumn gap={GAP.tight}>
                <Caption color="secondary">
                  {reply.mode === "replace" ? t("storyboardText.assist.proposal") : t("storyboardText.assist.note")}
                </Caption>
                <Text size="small" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {reply.text}
                </Text>
                {reply.why && (
                  <Caption color="secondary">{reply.why}</Caption>
                )}
              </FlexColumn>
            </ScrollArea>
          )}
          {reply && !running && (
            <FlexRow gap={GAP.tight} justify="flex-end">
              <EditorButton variant="text" size="small" onClick={() => close(true)}>
                {reply.mode === "replace" ? t("storyboardText.assist.discard") : t("storyboardText.assist.close")}
              </EditorButton>
              {reply.mode === "replace" && (
                <EditorButton variant="contained" size="small" onClick={accept}>
                  {t("storyboardText.assist.replace")}
                </EditorButton>
              )}
            </FlexRow>
          )}
          {stale && <Caption color="error">{t("storyboardText.assist.stale")}</Caption>}

          {running ? (
            <FlexRow gap={GAP.normal} align="center" justify="space-between">
              <ThinkingIndicator label={t("storyboardText.assist.thinking")} announce />
              <EditorButton variant="text" size="small" onClick={assist.cancel}>
                {t("storyboardText.assist.stop")}
              </EditorButton>
            </FlexRow>
          ) : (
            !reply && (
              <FlexRow gap={GAP.tight} wrap>
                {quick.map((action) => (
                  <Chip key={action.id} label={t(`storyboardText.assist.quick.${action.id}`)} compact onClick={() => submit(action.instruction)} />
                ))}
              </FlexRow>
            )
          )}

          <FlexRow gap={GAP.tight} align="center">
            <TextInput
              size="small"
              autoFocus
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit(instruction);
                }
              }}
              placeholder={reply ? t("storyboardText.assist.refinePlaceholder") : t("storyboardText.assist.placeholder")}
              label={t("storyboardText.assist.instruction")}
              hideLabel
              disabled={running}
            />
            <VoiceInputControl
              overlayHost={voiceHost}
              disabled={running}
              onTranscript={(text) => setInstruction((current) => (current ? `${current} ${text}` : text))}
            />
            <ToolbarIconButton
              icon={<ArrowUpwardIcon fontSize="small" />}
              tooltip={t("storyboardText.assist.send")}
              aria-label={t("storyboardText.assist.send")}
              variant="primary"
              size="small"
              disabled={!instruction.trim()}
              loading={running}
              onClick={() => submit(instruction)}
            />
          </FlexRow>

          {assist.error === "no_model" && <Caption color="warning">{t("storyboardText.assist.errors.no_model")}</Caption>}
          {(assist.error === "failed" || assist.error === "empty") && (
            <ErrorBanner
              report={{ source: "provider-call", summary: t("storyboardText.assist.failed"), errorText: assist.errorDetail ?? assist.error }}
            >
              {t(`storyboardText.assist.errors.${assist.error}`)}
            </ErrorBanner>
          )}
          <Caption color="secondary">{t("storyboardText.assist.context", { shots: result?.shotOrder.length ?? 0, entities: entities.size })}</Caption>
        </FlexColumn>
      )}
    </Popover>
  );
};

export default SelectionAssistPlugin;
