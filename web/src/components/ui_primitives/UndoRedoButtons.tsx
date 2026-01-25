/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip, Box, Divider } from "@mui/material";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

export interface UndoRedoButtonsProps {
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Undo callback */
  onUndo: () => void;
  /** Redo callback */
  onRedo: () => void;
  /** Size variant */
  size?: "small" | "medium" | "large";
  /** Whether to show divider between buttons */
  showDivider?: boolean;
  /** Undo tooltip */
  undoTooltip?: string;
  /** Redo tooltip */
  redoTooltip?: string;
  /** Layout direction */
  direction?: "horizontal" | "vertical";
  /** Additional className */
  className?: string;
}

const styles = (theme: Theme) => css`
  display: inline-flex;
  align-items: center;
  
  &.horizontal {
    flex-direction: row;
    gap: 4px;
  }
  
  &.vertical {
    flex-direction: column;
    gap: 4px;
  }
  
  .undo-redo-button {
    color: ${theme.vars.palette.text.secondary};
    padding: 6px;
    border-radius: 6px;
    transition: all 0.2s ease;
    
    &:hover:not(.Mui-disabled) {
      color: ${theme.vars.palette.text.primary};
      background-color: ${theme.vars.palette.action.hover};
    }
    
    &.Mui-disabled {
      color: ${theme.vars.palette.action.disabled};
      opacity: 0.5;
    }
  }
  
  .divider {
    &.horizontal {
      height: 24px;
      margin: 0 4px;
    }
    
    &.vertical {
      width: 24px;
      margin: 4px 0;
    }
  }
`;

export const UndoRedoButtons: React.FC<UndoRedoButtonsProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  size = "small",
  showDivider = false,
  undoTooltip = "Undo",
  redoTooltip = "Redo",
  direction = "horizontal",
  className
}) => {
  const theme = useTheme();
  
  const iconSize = size === "large" ? "medium" : "small";
  
  return (
    <Box 
      className={`undo-redo-buttons nodrag ${direction} ${className || ""}`}
      css={styles(theme)}
    >
      <Tooltip title={undoTooltip} enterDelay={TOOLTIP_ENTER_DELAY}>
        <span>
          <IconButton
            className="undo-redo-button"
            size={size}
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={undoTooltip}
          >
            <UndoIcon fontSize={iconSize} />
          </IconButton>
        </span>
      </Tooltip>
      
      {showDivider && (
        <Divider 
          className={`divider ${direction}`}
          orientation={direction === "horizontal" ? "vertical" : "horizontal"}
          flexItem
        />
      )}
      
      <Tooltip title={redoTooltip} enterDelay={TOOLTIP_ENTER_DELAY}>
        <span>
          <IconButton
            className="undo-redo-button"
            size={size}
            onClick={onRedo}
            disabled={!canRedo}
            aria-label={redoTooltip}
          >
            <RedoIcon fontSize={iconSize} />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

export default UndoRedoButtons;
