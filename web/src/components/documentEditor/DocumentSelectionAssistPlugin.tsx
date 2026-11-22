/**
 * Select text in a document, and a prompt opens beside it (document editor
 * PRD R10): say what to do with the passage. The model reads the whole
 * document. A replacement is the user's own edit: it lands as one undo step,
 * with no change mark and no version. Any other answer is shown as a note.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  HISTORY_PUSH_TAG,
  type RangeSelection
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

import { useDocumentTextAssist } from "../../hooks/document/useDocumentTextAssist";
import ErrorBanner from "../support/ErrorBanner";
import {
  BORDER_RADIUS,
  Caption,
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
  ToolbarIconButton
} from "../ui_primitives";

const PANEL_WIDTH = 400;
const RESULT_MAX_HEIGHT = 260;
/** A selection shorter than this opens no prompt: a stray drag, a double click. */
const MIN_SELECTION_CHARS = 3;

interface Session {
  selection: RangeSelection;
  text: string;
  anchor: { top: number; left: number };
}

interface DocumentSelectionAssistPluginProps {
  /** The document as Markdown, read when the prompt is sent. */
  getMarkdown: () => string;
}

export function DocumentSelectionAssistPlugin({ getMarkdown }: DocumentSelectionAssistPluginProps) {
  const { t } = useTranslation();
  const [editor] = useLexicalComposerContext();
  const assist = useDocumentTextAssist();
  const [session, setSession] = useState<Session | null>(null);
  const [instruction, setInstruction] = useState("");
  const dismissed = useRef<string | null>(null);
  const { reset } = assist;

  const close = useCallback(
    (remember: boolean) => {
      setSession((current) => {
        dismissed.current = remember && current ? current.text : null;
        return null;
      });
      setInstruction("");
      reset();
    },
    [reset]
  );

  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const read = (): void => {
      const found = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) return null;
        const text = selection.getTextContent();
        return text.trim().length >= MIN_SELECTION_CHARS
          ? { selection: selection.clone(), text }
          : null;
      });
      if (!found) {
        dismissed.current = null;
        return;
      }
      if (found.text === dismissed.current) return;
      const domSelection = window.getSelection();
      const range = domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null;
      const rect = range ? range.getBoundingClientRect() : root.getBoundingClientRect();
      setSession((current) => {
        if (current?.text === found.text) return current;
        setInstruction("");
        reset();
        return { ...found, anchor: { top: rect.bottom, left: rect.left } };
      });
    };
    const onMouseUp = (): void => {
      window.setTimeout(read, 0);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.shiftKey || event.key === "Shift") read();
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
      if (!session || !text.trim() || assist.status === "running") return;
      setInstruction("");
      if (assist.reply) {
        void assist.followUp(text);
        return;
      }
      void assist.ask({ markdown: getMarkdown(), selection: session.text, instruction: text });
    },
    [assist, getMarkdown, session]
  );

  const accept = useCallback(() => {
    const reply = assist.reply;
    if (!session || !reply || reply.mode !== "replace") return;
    editor.update(
      () => {
        $setSelection(session.selection.clone());
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertRawText(reply.text);
          $addUpdateTag(HISTORY_PUSH_TAG);
        }
      },
      { discrete: true }
    );
    close(false);
    editor.focus();
  }, [assist.reply, close, editor, session]);

  const running = assist.status === "running";
  const reply = assist.reply;

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
        <FlexColumn gap={GAP.normal} sx={{ padding: PADDING.normal }}>
          <Text size="small" color="secondary" lineClamp={2}>
            {session.text}
          </Text>
          {reply && (
            <ScrollArea
              thin
              maxHeight={RESULT_MAX_HEIGHT}
              sx={{ backgroundColor: "action.hover", borderRadius: BORDER_RADIUS.md, padding: PADDING.compact }}
            >
              <FlexColumn gap={GAP.tight}>
                <Caption color="secondary">
                  {reply.mode === "replace" ? t("documentEditor.assist.proposal") : t("documentEditor.assist.note")}
                </Caption>
                <Text size="small" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                  {reply.text}
                </Text>
                {reply.why && <Caption color="secondary">{reply.why}</Caption>}
              </FlexColumn>
            </ScrollArea>
          )}
          {reply && !running && (
            <FlexRow gap={GAP.tight} justify="flex-end">
              <EditorButton variant="text" size="small" onClick={() => close(true)}>
                {reply.mode === "replace" ? t("documentEditor.assist.discard") : t("documentEditor.assist.close")}
              </EditorButton>
              {reply.mode === "replace" && (
                <EditorButton variant="contained" size="small" onClick={accept}>
                  {t("documentEditor.assist.replace")}
                </EditorButton>
              )}
            </FlexRow>
          )}
          {running && (
            <FlexRow gap={GAP.normal} align="center" justify="space-between">
              <ThinkingIndicator label={t("documentEditor.assist.thinking")} announce />
              <EditorButton variant="text" size="small" onClick={assist.cancel}>
                {t("documentEditor.assist.stop")}
              </EditorButton>
            </FlexRow>
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
              placeholder={reply ? t("documentEditor.assist.refinePlaceholder") : t("documentEditor.assist.placeholder")}
              label={t("documentEditor.assist.instruction")}
              hideLabel
              disabled={running}
            />
            <ToolbarIconButton
              icon={<ArrowUpwardIcon fontSize="small" />}
              tooltip={t("documentEditor.assist.send")}
              aria-label={t("documentEditor.assist.send")}
              variant="primary"
              size="small"
              disabled={!instruction.trim()}
              loading={running}
              onClick={() => submit(instruction)}
            />
          </FlexRow>
          {assist.error === "no_model" && (
            <Caption color="warning">{t("documentEditor.assist.noModel")}</Caption>
          )}
          {(assist.error === "failed" || assist.error === "empty") && (
            <ErrorBanner
              report={{
                source: "provider-call",
                summary: "Document selection prompt failed",
                errorText: assist.errorDetail ?? assist.error
              }}
            >
              {t("documentEditor.assist.failed")}
            </ErrorBanner>
          )}
        </FlexColumn>
      )}
    </Popover>
  );
}
