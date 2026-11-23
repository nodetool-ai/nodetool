/**
 * Select text in a document, and a hovering AI icon appears beside the
 * selection without stealing focus (document editor PRD R10). Clicking the
 * icon opens a prompt where the model reads the whole document. A replacement
 * is the user's own edit: it lands as one undo step, with no change mark and
 * no version. Any other answer is shown as a note.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  SELECTION_CHANGE_COMMAND,
  type RangeSelection
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import { useDocumentTextAssist } from "../../hooks/document/useDocumentTextAssist";
import ErrorBanner from "../support/ErrorBanner";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  Popover,
  SHADOW,
  ScrollArea,
  Text,
  TextInput,
  ThinkingIndicator,
  ToolbarIconButton,
  Z_INDEX
} from "../ui_primitives";

const PANEL_WIDTH = 400;
const RESULT_MAX_HEIGHT = 260;
const THINKING_MARK_SIZE = 10;
const TRIGGER_BOX_SIZE = 34;
const TRIGGER_GAP = 6;
const VIEWPORT_MARGIN = 8;

interface AnchorPair {
  triggerAnchor: { top: number; left: number };
  popoverAnchor: { top: number; left: number };
  visible: boolean;
}

interface SelectionTarget {
  selection: RangeSelection;
  signature: string;
  text: string;
  triggerAnchor: { top: number; left: number };
  popoverAnchor: { top: number; left: number };
}

function signatureOf(selection: RangeSelection, text: string): string {
  return `${selection.anchor.key}:${selection.anchor.offset}:${selection.focus.key}:${selection.focus.offset}:${text}`;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function measureSelectionAnchors(root: HTMLElement): AnchorPair {
  const domSelection = window.getSelection();
  const range =
    domSelection && domSelection.rangeCount > 0 && !domSelection.isCollapsed
      ? domSelection.getRangeAt(0)
      : null;

  let boundingRect: DOMRect | null = null;
  let endRect: DOMRect | null = null;

  if (
    range &&
    root.contains(range.startContainer) &&
    root.contains(range.endContainer)
  ) {
    if (typeof range.getBoundingClientRect === "function") {
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        boundingRect = rect;
      }
    }
    if (typeof range.getClientRects === "function") {
      const rects = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 || rect.height > 0
      );
      if (rects.length > 0) {
        endRect = rects[rects.length - 1];
        if (!boundingRect) {
          boundingRect = rects[0];
        }
      }
    }
  }

  const fallback = root.getBoundingClientRect();
  const baseRect = boundingRect ?? fallback;
  const triggerRefRect = endRect ?? baseRect;

  const scrollHost = root.closest(".doc-scroll");
  let visible = true;
  if (scrollHost && boundingRect) {
    const scrollRect = scrollHost.getBoundingClientRect();
    if (scrollRect.height > 0) {
      visible =
        baseRect.bottom >= scrollRect.top && baseRect.top <= scrollRect.bottom;
    }
  }

  const viewportWidth =
    typeof window !== "undefined" && window.innerWidth > 0
      ? window.innerWidth
      : 1024;
  const viewportHeight =
    typeof window !== "undefined" && window.innerHeight > 0
      ? window.innerHeight
      : 768;

  const aboveTop = triggerRefRect.top - TRIGGER_BOX_SIZE - TRIGGER_GAP;
  const belowTop = triggerRefRect.bottom + TRIGGER_GAP;
  const triggerTop =
    aboveTop >= VIEWPORT_MARGIN
      ? aboveTop
      : clamp(
          belowTop,
          VIEWPORT_MARGIN,
          viewportHeight - TRIGGER_BOX_SIZE - VIEWPORT_MARGIN
        );
  const preferredLeft = Math.max(
    triggerRefRect.left,
    triggerRefRect.right - TRIGGER_BOX_SIZE
  );
  const triggerLeft = clamp(
    preferredLeft,
    VIEWPORT_MARGIN,
    viewportWidth - TRIGGER_BOX_SIZE - VIEWPORT_MARGIN
  );

  return {
    triggerAnchor: { top: triggerTop, left: triggerLeft },
    popoverAnchor: { top: baseRect.bottom, left: baseRect.left },
    visible
  };
}

interface DocumentSelectionAssistPluginProps {
  /** The document as Markdown, read when the prompt is sent. */
  getMarkdown: () => string;
}

export function DocumentSelectionAssistPlugin({ getMarkdown }: DocumentSelectionAssistPluginProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [editor] = useLexicalComposerContext();
  const assist = useDocumentTextAssist();
  const [trigger, setTrigger] = useState<SelectionTarget | null>(null);
  const [session, setSession] = useState<SelectionTarget | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editedProposal, setEditedProposal] = useState("");
  const triggerRef = useRef<SelectionTarget | null>(null);
  const sessionRef = useRef<SelectionTarget | null>(null);
  const dismissedRef = useRef<string | null>(null);
  const pointerDownRef = useRef(false);
  const dragStartedInEditorRef = useRef(false);
  const triggerContainerRef = useRef<HTMLDivElement | null>(null);
  const { reset } = assist;
  const reply = assist.reply;

  triggerRef.current = trigger;
  sessionRef.current = session;

  useEffect(() => {
    if (reply?.mode === "replace") {
      setEditedProposal(reply.text);
    } else {
      setEditedProposal("");
    }
  }, [reply, session]);

  const close = useCallback(
    (remember: boolean) => {
      const current = sessionRef.current;
      dismissedRef.current = remember && current ? current.signature : null;
      sessionRef.current = null;
      triggerRef.current = null;
      setSession(null);
      setTrigger(null);
      setInstruction("");
      setEditedProposal("");
      reset();
    },
    [reset]
  );

  const openFromTrigger = useCallback(() => {
    const active = triggerRef.current;
    if (!active) {
      return;
    }
    const root = editor.getRootElement();
    const measured = root ? measureSelectionAnchors(root) : null;
    const nextSession: SelectionTarget = measured
      ? {
          ...active,
          triggerAnchor: measured.triggerAnchor,
          popoverAnchor: measured.popoverAnchor
        }
      : active;
    triggerRef.current = null;
    setTrigger(null);
    sessionRef.current = nextSession;
    setSession(nextSession);
    setInstruction("");
    reset();
  }, [editor, reset]);

  useEffect(() => {
    let pendingTimer: number | null = null;
    const clearPendingTimer = (): void => {
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer);
        pendingTimer = null;
      }
    };

    const clearTrigger = (): void => {
      if (triggerRef.current !== null) {
        triggerRef.current = null;
        setTrigger(null);
      }
    };

    const read = (): boolean => {
      const root = editor.getRootElement();
      if (!root || sessionRef.current !== null) {
        return false;
      }
      const found = editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          return null;
        }
        const text = selection.getTextContent();
        if (text.trim().length === 0) {
          return null;
        }
        return {
          selection: selection.clone(),
          signature: signatureOf(selection, text),
          text
        };
      });
      if (!found) {
        dismissedRef.current = null;
        clearTrigger();
        return false;
      }
      const domSelection = window.getSelection();
      if (
        domSelection &&
        domSelection.rangeCount > 0 &&
        !domSelection.isCollapsed
      ) {
        const range = domSelection.getRangeAt(0);
        if (
          root.contains(range.startContainer) &&
          root.contains(range.endContainer)
        ) {
          const domText = domSelection.toString();
          if (domText.trim().length > 0 && domText !== found.text) {
            return false;
          }
        }
      }
      if (found.signature === dismissedRef.current) {
        clearTrigger();
        return false;
      }
      const measured = measureSelectionAnchors(root);
      if (!measured.visible) {
        clearTrigger();
        return false;
      }
      const nextTarget: SelectionTarget = {
        ...found,
        triggerAnchor: measured.triggerAnchor,
        popoverAnchor: measured.popoverAnchor
      };
      const prev = triggerRef.current;
      if (
        prev &&
        prev.signature === nextTarget.signature &&
        prev.triggerAnchor.top === nextTarget.triggerAnchor.top &&
        prev.triggerAnchor.left === nextTarget.triggerAnchor.left
      ) {
        return true;
      }
      triggerRef.current = nextTarget;
      setTrigger(nextTarget);
      return true;
    };

    const readNowOrSoon = (): void => {
      clearPendingTimer();
      if (!read()) {
        pendingTimer = window.setTimeout(() => {
          pendingTimer = null;
          if (!pointerDownRef.current) {
            read();
          }
        }, 0);
      }
    };

    const isInTrigger = (target: EventTarget | null): boolean =>
      target instanceof Node &&
      triggerContainerRef.current !== null &&
      triggerContainerRef.current.contains(target);

    const isInEditorSurface = (target: EventTarget | null): boolean => {
      const root = editor.getRootElement();
      if (!root || !(target instanceof Node)) {
        return false;
      }
      if (target === root || root.contains(target)) {
        return true;
      }
      const scrollHost = root.closest(".doc-scroll");
      return scrollHost !== null && scrollHost.contains(target);
    };

    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0 || isInTrigger(event.target)) {
        return;
      }
      clearPendingTimer();
      pointerDownRef.current = true;
      const inEditor = isInEditorSurface(event.target);
      dragStartedInEditorRef.current = inEditor;
      if (inEditor && sessionRef.current === null) {
        dismissedRef.current = null;
        clearTrigger();
      }
    };

    const onMouseUp = (event: MouseEvent): void => {
      if (isInTrigger(event.target)) {
        return;
      }
      const root = editor.getRootElement();
      const target = event.target;
      const endedInRoot =
        root !== null &&
        target instanceof Node &&
        (target === root || root.contains(target));
      const wasEditorDrag = dragStartedInEditorRef.current;
      pointerDownRef.current = false;
      dragStartedInEditorRef.current = false;
      if (sessionRef.current !== null) {
        return;
      }
      if (wasEditorDrag || endedInRoot) {
        readNowOrSoon();
      }
    };

    const onWindowBlur = (): void => {
      pointerDownRef.current = false;
      dragStartedInEditorRef.current = false;
    };

    let rootCleanup: (() => void) | null = null;
    const bindRoot = (root: HTMLElement | null): void => {
      rootCleanup?.();
      rootCleanup = null;
      if (!root) {
        return;
      }
      const onDblClick = (): void => {
        if (!pointerDownRef.current) {
          readNowOrSoon();
        }
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape" && triggerRef.current && !sessionRef.current) {
          dismissedRef.current = triggerRef.current.signature;
          clearTrigger();
        }
      };
      const onKeyUp = (event: KeyboardEvent): void => {
        if (pointerDownRef.current || sessionRef.current !== null) {
          return;
        }
        if (
          event.shiftKey ||
          event.key === "Shift" ||
          event.key === "a" ||
          event.key === "A"
        ) {
          readNowOrSoon();
        }
      };
      root.addEventListener("dblclick", onDblClick);
      root.addEventListener("keydown", onKeyDown);
      root.addEventListener("keyup", onKeyUp);
      rootCleanup = () => {
        root.removeEventListener("dblclick", onDblClick);
        root.removeEventListener("keydown", onKeyDown);
        root.removeEventListener("keyup", onKeyUp);
      };
    };

    bindRoot(editor.getRootElement());

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onWindowBlur);

    const unregister = mergeRegister(
      editor.registerRootListener((nextRoot) => {
        bindRoot(nextRoot);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          if (!pointerDownRef.current) {
            read();
          }
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(() => {
        if (!pointerDownRef.current && sessionRef.current === null && triggerRef.current !== null) {
          read();
        }
      })
    );

    return () => {
      clearPendingTimer();
      rootCleanup?.();
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onWindowBlur);
      unregister();
    };
  }, [editor]);

  useEffect(() => {
    if (!trigger || session) {
      return;
    }
    const root = editor.getRootElement();
    if (!root) {
      return;
    }
    const scrollHost = root.closest(".doc-scroll");
    const reposition = (): void => {
      const active = triggerRef.current;
      if (!active || sessionRef.current !== null) {
        return;
      }
      const measured = measureSelectionAnchors(root);
      if (!measured.visible) {
        triggerRef.current = null;
        setTrigger(null);
        return;
      }
      if (
        measured.triggerAnchor.top === active.triggerAnchor.top &&
        measured.triggerAnchor.left === active.triggerAnchor.left &&
        measured.popoverAnchor.top === active.popoverAnchor.top &&
        measured.popoverAnchor.left === active.popoverAnchor.left
      ) {
        return;
      }
      const updated: SelectionTarget = {
        ...active,
        triggerAnchor: measured.triggerAnchor,
        popoverAnchor: measured.popoverAnchor
      };
      triggerRef.current = updated;
      setTrigger(updated);
    };
    window.addEventListener("resize", reposition);
    scrollHost?.addEventListener("scroll", reposition, { passive: true });
    return () => {
      window.removeEventListener("resize", reposition);
      scrollHost?.removeEventListener("scroll", reposition);
    };
  }, [editor, session, trigger]);

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
    if (!session || !reply || reply.mode !== "replace") return;
    editor.update(
      () => {
        $setSelection(session.selection.clone());
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          selection.insertRawText(editedProposal);
          $addUpdateTag(HISTORY_PUSH_TAG);
        }
      },
      { discrete: true }
    );
    close(false);
    editor.focus();
  }, [close, editedProposal, editor, reply, session]);

  const running = assist.status === "running";

  return (
    <>
      {trigger &&
        !session &&
        typeof document !== "undefined" &&
        createPortal(
          <Box
            ref={triggerContainerRef}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            sx={{
              position: "fixed",
              top: trigger.triggerAnchor.top,
              left: trigger.triggerAnchor.left,
              zIndex: Z_INDEX.overlay,
              display: "inline-flex",
              alignItems: "center",
              padding: PADDING.micro,
              borderRadius: BORDER_RADIUS.md,
              backgroundColor: theme.vars.palette.Paper.overlay,
              border: `1px solid ${theme.vars.palette.divider}`,
              boxShadow: SHADOW(theme).md
            }}
          >
            <ToolbarIconButton
              icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
              tooltip={t(
                "documentEditor.assist.open",
                "Ask assistant about selection"
              )}
              aria-label={t(
                "documentEditor.assist.open",
                "Ask assistant about selection"
              )}
              aria-haspopup="dialog"
              aria-expanded={false}
              variant="primary"
              size="small"
              onClick={openFromTrigger}
            />
          </Box>,
          document.body
        )}
      <Popover
        open={session !== null}
        onClose={() => close(true)}
        anchorReference="anchorPosition"
        anchorPosition={session?.popoverAnchor}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        disableRestoreFocus
        transitionDuration={0}
        maxWidth={PANEL_WIDTH}
        maxHeight="calc(100vh - 32px)"
        paperSx={{ width: PANEL_WIDTH, marginTop: GAP.normal }}
      >
        {session && (
          <FlexColumn
            gap={GAP.normal}
            sx={{ padding: PADDING.normal }}
          >
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
                  {reply.mode === "replace" ? (
                    <TextInput
                      multiline
                      minRows={2}
                      maxRows={8}
                      compact
                      size="small"
                      value={editedProposal}
                      onChange={(event) => setEditedProposal(event.target.value)}
                      label={t("documentEditor.assist.editProposal", "Edit proposed replacement")}
                      hideLabel
                      disabled={running}
                    />
                  ) : (
                    <Text size="small" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                      {reply.text}
                    </Text>
                  )}
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
                <Caption component="div" color="secondary">
                  <ThinkingIndicator
                    size={THINKING_MARK_SIZE}
                    label={t("documentEditor.assist.thinking")}
                    announce
                  />
                </Caption>
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
    </>
  );
}
