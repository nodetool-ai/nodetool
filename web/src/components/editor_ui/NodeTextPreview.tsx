/** @jsxImportSource @emotion/react */
/**
 * NodeTextPreview
 *
 * Static stand-in for a multiline node text field. It renders the text only,
 * so it takes no wheel, pan, or drag events from the canvas. A click or
 * Enter asks the owner to swap in the real text field.
 */

import {
  memo,
  useCallback,
  type KeyboardEvent,
  type MouseEvent,
  type Ref
} from "react";
import { useTheme } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import { cn } from "./editorUtils";

export interface NodeTextPreviewProps {
  value: string;
  /** Called with the caret offset under the click, or null for keyboard. */
  onActivate: (caretOffset: number | null) => void;
  ariaLabel: string;
  minRows?: number;
  maxRows?: number;
  tabIndex?: number;
  className?: string;
  sx?: SxProps<Theme>;
  ref?: Ref<HTMLDivElement>;
}

// Match the node text field: its text sets 1.5em lines, and MUI sizes each
// row from the field's 1.7em minimum height and rounds up to a pixel.
const LINE_HEIGHT_EM = 1.5;

const ROW_HEIGHT_EM = 1.7;

/** Text offset under a click, when the click lands in the preview's text. */
const caretOffsetAt = (event: MouseEvent<HTMLElement>): number | null => {
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY);
  if (!range || !event.currentTarget.contains(range.startContainer)) {
    return null;
  }
  return range.startOffset;
};

export function NodeTextPreview({
  value,
  onActivate,
  ariaLabel,
  minRows,
  maxRows,
  tabIndex = 0,
  className,
  sx,
  ref
}: NodeTextPreviewProps) {
  const theme = useTheme();
  const padY = theme.editor.padYNode;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      onActivate(caretOffsetAt(event));
    },
    [onActivate]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(null);
      }
    },
    [onActivate]
  );

  return (
    <Box
      ref={ref}
      role="button"
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      className={cn("node-text-preview", className)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      sx={[
        {
          boxSizing: "border-box",
          width: "100%",
          padding: `${padY} ${theme.editor.padXNode}`,
          minHeight:
            minRows === undefined
              ? undefined
              : `round(up, ${minRows * ROW_HEIGHT_EM}em + 2 * ${padY}, 1px)`,
          maxHeight:
            maxRows === undefined
              ? undefined
              : `round(up, ${maxRows * ROW_HEIGHT_EM}em + 2 * ${padY}, 1px)`,
          overflow: "hidden",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          fontFamily: theme.fontFamily1,
          fontSize: theme.fontSizeSmaller,
          fontWeight: 400,
          lineHeight: `${LINE_HEIGHT_EM}em`,
          color: theme.vars.palette.text.primary,
          backgroundColor: theme.vars.palette.c_overlay_subtle,
          borderRadius: theme.editor.controlRadius,
          cursor: "text",
          "&:hover": {
            backgroundColor: theme.vars.palette.action.selected
          }
        },
        ...(Array.isArray(sx) ? sx : [sx])
      ]}
    >
      {value}
    </Box>
  );
}

export default memo(NodeTextPreview);
