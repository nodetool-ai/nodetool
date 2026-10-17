/**
 * The writing assistant on a TextArea: the corner icon and its panel.
 *
 * The panel holds one-click actions, a free instruction, and the reply as a
 * suggestion. The field changes only when the user replaces it with the
 * suggestion. A further instruction refines the suggestion.
 *
 * TextArea loads this module lazily, so the chat store and the model menu
 * stay out of the primitives bundle.
 */

import React, { memo, useCallback, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

import useGlobalChatStore from "../../stores/GlobalChatStore";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ReportBugButton from "../support/ReportBugButton";
import {
  BORDER_RADIUS,
  Box,
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
  ToolbarIconButton
} from "../ui_primitives";
import { useTextAssist } from "../../hooks/useTextAssist";
import type { LanguageModel } from "../../stores/ApiTypes";
import {
  TEXT_ASSIST_ACTIONS,
  type TextAssistField
} from "../../utils/textAssist";

const PANEL_WIDTH = 380;
const SUGGESTION_MAX_HEIGHT = 240;

export interface TextAssistButtonProps {
  /** The field's current text. */
  readonly value: string;
  /** Replaces the field's text with the accepted suggestion. */
  readonly onApply: (text: string) => void;
  readonly field: TextAssistField;
  readonly disabled?: boolean;
  /** Reports the open state, so the field keeps the icon visible. */
  readonly onOpenChange?: (open: boolean) => void;
}

const ModelPicker: React.FC = () => {
  const model = useGlobalChatStore((s) => s.selectedModel);
  const setSelectedModel = useGlobalChatStore((s) => s.setSelectedModel);
  return (
    <LanguageModelSelect
      value={model?.id ?? ""}
      provider={model?.provider}
      placeholder="Model for writing"
      onChange={(value) => setSelectedModel(value as LanguageModel)}
    />
  );
};

const TextAssistButtonInternal: React.FC<TextAssistButtonProps> = ({
  value,
  onApply,
  field,
  disabled = false,
  onOpenChange
}) => {
  const theme = useTheme();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const { proposal, status, error, run, cancel, reset } = useTextAssist(field);

  const running = status === "running";
  const source = proposal ?? value;
  const hasSource = source.trim().length > 0;
  const actions = TEXT_ASSIST_ACTIONS.filter(
    (action) => action.needsText === hasSource
  );

  const setPanelOpen = useCallback(
    (next: boolean): void => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  const close = useCallback((): void => {
    cancel();
    setPanelOpen(false);
  }, [cancel, setPanelOpen]);

  const submit = (text: string): void => {
    const trimmed = text.trim();
    if (!trimmed || running) {
      return;
    }
    setInstruction("");
    void run(trimmed, source);
  };

  const apply = (): void => {
    if (proposal === null) {
      return;
    }
    onApply(proposal);
    reset();
    close();
  };

  return (
    <>
      <ToolbarIconButton
        ref={anchorRef}
        className="text-assist-trigger"
        icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
        tooltip="Writing assistant"
        aria-label="Open the writing assistant"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        size="small"
        onClick={() => setPanelOpen(!open)}
      />
      <Popover
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        placement="bottom-right"
        paperSx={{ width: PANEL_WIDTH, maxWidth: "calc(100vw - 32px)" }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": "Writing assistant"
          }
        }}
      >
        <FlexColumn gap={GAP.comfortable} sx={{ p: PADDING.comfortable }}>
          <FlexRow gap={GAP.tight} align="center">
            <AutoAwesomeOutlinedIcon fontSize="small" color="primary" />
            <Text weight={500}>Writing assistant</Text>
          </FlexRow>

          {proposal !== null && (
            <FlexColumn gap={GAP.tight}>
              <Caption>Suggestion</Caption>
              <Box
                aria-live="polite"
                sx={{
                  borderRadius: BORDER_RADIUS.md,
                  border: `1px solid ${theme.vars.palette.divider}`,
                  backgroundColor: theme.vars.palette.background.default,
                  whiteSpace: "pre-wrap"
                }}
              >
                <ScrollArea
                  thin
                  maxHeight={SUGGESTION_MAX_HEIGHT}
                  padding={PADDING.normal}
                >
                  <Text size="small">{proposal}</Text>
                </ScrollArea>
              </Box>
              <FlexRow gap={GAP.tight} justify="flex-end">
                <EditorButton
                  variant="text"
                  size="small"
                  onClick={reset}
                  disabled={running}
                >
                  Discard
                </EditorButton>
                <EditorButton
                  variant="contained"
                  size="small"
                  onClick={apply}
                  disabled={running}
                >
                  {value.trim() ? "Replace text" : "Insert"}
                </EditorButton>
              </FlexRow>
            </FlexColumn>
          )}

          {running ? (
            <FlexRow gap={GAP.normal} align="center" justify="space-between">
              <ThinkingIndicator label="Writing" announce />
              <EditorButton variant="text" size="small" onClick={cancel}>
                Stop
              </EditorButton>
            </FlexRow>
          ) : (
            <FlexRow gap={GAP.tight} wrap>
              {actions.map((action) => (
                <Chip
                  key={action.id}
                  label={action.label}
                  compact
                  onClick={() => submit(action.instruction)}
                />
              ))}
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
              placeholder={
                proposal !== null
                  ? "Refine the suggestion…"
                  : "Tell the assistant what to write…"
              }
              label="Instruction"
              hideLabel
              disabled={running}
            />
            <ToolbarIconButton
              icon={<ArrowUpwardIcon fontSize="small" />}
              tooltip="Send"
              aria-label="Send the instruction"
              variant="primary"
              size="small"
              disabled={running || !instruction.trim()}
              onClick={() => submit(instruction)}
            />
          </FlexRow>

          {error && (
            <FlexRow gap={GAP.tight} align="center" justify="space-between">
              <Caption color="error" role="alert">
                {error}
              </Caption>
              <ReportBugButton
                context={{
                  source: "provider-call",
                  summary: "Writing assistant request failed",
                  errorText: error
                }}
              />
            </FlexRow>
          )}

          <FlexRow gap={GAP.normal} align="center" justify="space-between">
            <Caption>Model</Caption>
            <ModelPicker />
          </FlexRow>
        </FlexColumn>
      </Popover>
    </>
  );
};

export const TextAssistButton = memo(TextAssistButtonInternal);
TextAssistButton.displayName = "TextAssistButton";

export default TextAssistButton;
