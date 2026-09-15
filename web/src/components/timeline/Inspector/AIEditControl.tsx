import React, { memo, useCallback, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import {
  EditorButton,
  EditorMenu,
  EditorMenuItem,
  FlexColumn,
  GAP,
  PADDING,
  TextInput
} from "../../ui_primitives";
import type { TimelineClip } from "@nodetool-ai/timeline";

export type AIEditOperation =
  | "extend"
  | "replace-range"
  | "remove-object"
  | "replace-object"
  | "restyle"
  | "regenerate";

export interface TimelineGenerativeEditRequest {
  target: string;
  clipId: string;
  sourceAssetId: string;
  operation:
    | "extend"
    | "replace_range"
    | "remove_object"
    | "replace_object"
    | "restyle"
    | "regenerate";
  prompt: string;
  direction?: "start" | "end";
  durationMs?: number;
  provider?: string;
  model?: string;
}

const wireOperation = (operation: AIEditOperation): TimelineGenerativeEditRequest["operation"] =>
  operation.replace("-", "_") as TimelineGenerativeEditRequest["operation"];

/** Emits an intent for the timeline generation coordinator without changing the active take. */
export function emitTimelineGenerativeEdit(
  clip: TimelineClip,
  operation: AIEditOperation,
  prompt: string
): void {
  if (!clip.currentAssetId || typeof window === "undefined") return;
  const detail: TimelineGenerativeEditRequest = {
    target: clip.id,
    clipId: clip.id,
    sourceAssetId: clip.currentAssetId,
    operation: wireOperation(operation),
    prompt,
    provider: clip.provider,
    model: clip.model
  };
  if (operation === "extend") {
    detail.direction = "end";
    detail.durationMs = 1000;
  }
  window.dispatchEvent(new CustomEvent("nodetool:timeline-generative-edit", { detail }));
}

interface OperationOption {
  operation: AIEditOperation;
  label: string;
  instruction: string;
}

const OPERATION_OPTIONS: readonly OperationOption[] = [
  { operation: "extend", label: "Extend", instruction: "Extend this clip naturally" },
  { operation: "replace-range", label: "Replace range", instruction: "Replace the selected range while preserving the surrounding edit" },
  { operation: "remove-object", label: "Remove object", instruction: "Remove the specified object and fill the background naturally" },
  { operation: "replace-object", label: "Replace object", instruction: "Replace the specified object with the requested subject" },
  { operation: "restyle", label: "Restyle", instruction: "Restyle this clip with the requested visual direction" },
  { operation: "regenerate", label: "Regenerate", instruction: "Regenerate this clip with the same intent" }
];

export interface AIEditControlProps {
  disabled?: boolean;
  onSubmit: (operation: AIEditOperation, instruction: string) => void;
}

/** Provider-agnostic editing intents shared by workflow and direct-gen clips. */
export const AIEditControl: React.FC<AIEditControlProps> = memo(
  ({ disabled = false, onSubmit }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [selected, setSelected] = useState<OperationOption>(OPERATION_OPTIONS[5]);
    const [instruction, setInstruction] = useState(selected.instruction);

    const close = useCallback(() => setAnchorEl(null), []);
    const handleSelect = useCallback((option: OperationOption) => {
      setSelected(option);
      setInstruction(option.instruction);
    }, []);
    const handleSubmit = useCallback(() => {
      const value = instruction.trim();
      if (!value) return;
      onSubmit(selected.operation, value);
      close();
    }, [close, instruction, onSubmit, selected.operation]);

    return (
      <>
        <EditorButton
          aria-haspopup="menu"
          aria-expanded={Boolean(anchorEl)}
          aria-controls={anchorEl ? "timeline-ai-edit-menu" : undefined}
          disabled={disabled}
          startIcon={<AutoAwesomeOutlinedIcon />}
          onClick={(event) => setAnchorEl(event.currentTarget)}
          data-testid="timeline-ai-edit"
        >
          AI Edit
        </EditorButton>
        <EditorMenu
          id="timeline-ai-edit-menu"
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={close}
          MenuListProps={{ "aria-label": "AI edit operations" }}
        >
          {OPERATION_OPTIONS.map((option) => (
            <EditorMenuItem
              key={option.operation}
              selected={option.operation === selected.operation}
              onClick={() => handleSelect(option)}
              role="menuitemradio"
              aria-checked={option.operation === selected.operation}
            >
              {option.label}
            </EditorMenuItem>
          ))}
          <FlexColumn gap={GAP.normal} sx={{ p: PADDING.normal, width: 280 }}>
            <TextInput
              label="Edit instruction"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              autoFocus
            />
            <EditorButton fullWidth variant="contained" onClick={handleSubmit} disabled={!instruction.trim()}>
              Apply {selected.label}
            </EditorButton>
          </FlexColumn>
        </EditorMenu>
      </>
    );
  }
);

AIEditControl.displayName = "AIEditControl";
