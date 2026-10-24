import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import { Box } from "./Box";
import { ToolbarIconButton } from "./ToolbarIconButton";
import { ToolbarDivider } from "./Toolbar";
import { SPACING } from "./spacing";

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

/** The history pair every editor toolbar starts with: two `ToolbarIconButton`s. */
const UndoRedoButtonsInternal: React.FC<UndoRedoButtonsProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  size = "small",
  showDivider = false,
  undoTooltip,
  redoTooltip,
  direction = "horizontal",
  className
}) => {
  const { t } = useTranslation();
  const resolvedUndoTooltip = undoTooltip ?? t("i18n-next95.undoRedoButtons.undoTooltip");
  const resolvedRedoTooltip = redoTooltip ?? t("i18n-next95.undoRedoButtons.redoTooltip");

  return (
    <Box
      className={`undo-redo-buttons nodrag ${direction} ${className || ""}`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        flexDirection: direction === "horizontal" ? "row" : "column",
        gap: SPACING.xs
      }}
    >
      <ToolbarIconButton
        className="undo-redo-button"
        icon={<UndoIcon />}
        tooltip={resolvedUndoTooltip}
        size={size}
        onClick={onUndo}
        disabled={!canUndo}
      />
      {showDivider && direction === "horizontal" && <ToolbarDivider />}
      <ToolbarIconButton
        className="undo-redo-button"
        icon={<RedoIcon />}
        tooltip={resolvedRedoTooltip}
        size={size}
        onClick={onRedo}
        disabled={!canRedo}
      />
    </Box>
  );
};

export const UndoRedoButtons = memo(UndoRedoButtonsInternal);
export default UndoRedoButtons;
