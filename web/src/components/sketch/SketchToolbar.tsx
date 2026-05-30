/**
 * SketchToolbar
 *
 * Narrow vertical icon toolbar for tool selection only.
 * Tools are arranged in a single vertical column with spacing between groups.
 * Color controls (compact overlapping FG/BG swatch) live below the tools.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { ToggleButtonGroup, ToggleButton } from "@mui/material";
import { Divider, FlexColumn, Tooltip } from "../ui_primitives";
import type { SelectToolMode, SketchTool } from "./types";
import {
  getToolShortcutActionId,
  TOOLBAR_TOOL_GROUPS,
  type ToolDefinition
} from "./toolDefinitions";
import { displayCombo } from "./shortcuts";
import ColorSwatchPair from "./ColorSwatchPair";
import { SKETCH_SPACING, SKETCH_TOOLTIP_DELAY_MS } from "./sketchStyles";

const BTN = 36; // button size px

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: SKETCH_SPACING.md,
    padding: `${SKETCH_SPACING.lg} ${SKETCH_SPACING.sm}`,
    // Darker than the surrounding chrome so the soft rounded active highlight
    // reads as a distinct box (matches the editor's tool-rail design).
    backgroundColor: theme.vars.palette.grey[900],
    borderRight: `1px solid ${theme.vars.palette.grey[800]}`,
    width: `${BTN + 8 + 2}px`, // single column + padding + border
    overflowY: "auto",
    flexShrink: 0,
    // Larger gap between tool groups; tighter even spacing within a group.
    "& .tool-sections": {
      display: "flex",
      flexDirection: "column",
      gap: SKETCH_SPACING.lg
    },
    "& .tool-section": {
      display: "flex",
      flexDirection: "column"
    },
    "& .MuiToggleButtonGroup-root": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: SKETCH_SPACING.sm,
      width: "100%"
    },
    "& .MuiToggleButton-root": {
      padding: SKETCH_SPACING.sm,
      width: `${BTN}px`,
      height: `${BTN}px`,
      minWidth: `${BTN}px`,
      minHeight: `${BTN}px`,
      border: "none",
      borderRadius: "8px !important",
      color: theme.vars.palette.grey[400],
      transition: "background-color 0.12s ease, color 0.12s ease",
      "&.Mui-selected": {
        backgroundColor: theme.vars.palette.grey[700],
        color: theme.vars.palette.grey[50],
        "&:hover": { backgroundColor: theme.vars.palette.grey[700] }
      },
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100]
      }
    },
    "& .MuiDivider-root": {
      borderColor: theme.vars.palette.grey[800],
      mx: SKETCH_SPACING.xs
    }
  });

function renderToolButton(def: ToolDefinition, selectMode: SelectToolMode) {
  const { tool, label, Icon } = def;
  const actionId = getToolShortcutActionId(tool, selectMode);
  const shortcut = actionId ? displayCombo(actionId) : "";
  const tooltipText = shortcut ? `${label} (${shortcut})` : label;
  const tooltip =
    tool === "clone_stamp"
      ? `${tooltipText} — Alt+click to set source`
      : tooltipText;

  return (
    <ToggleButton key={tool} value={tool} aria-label={label}>
      <Tooltip
        title={tooltip}
        placement="right"
        enterDelay={SKETCH_TOOLTIP_DELAY_MS}
        enterNextDelay={SKETCH_TOOLTIP_DELAY_MS}
      >
        <Icon sx={{ fontSize: "18px" }} />
      </Tooltip>
    </ToggleButton>
  );
}

export interface SketchToolbarProps {
  activeTool: SketchTool;
  selectMode: SelectToolMode;
  onToolChange: (tool: SketchTool) => void;
  foregroundColor: string;
  backgroundColor: string;
  onForegroundColorChange: (color: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onSwapColors: () => void;
  onResetColors: () => void;
}

const SketchToolbar: React.FC<SketchToolbarProps> = ({
  activeTool,
  selectMode,
  onToolChange,
  foregroundColor,
  backgroundColor,
  onForegroundColorChange,
  onBackgroundColorChange,
  onSwapColors,
  onResetColors
}) => {
  const theme = useTheme();

  const handleToolChange = useCallback(
    (_: React.MouseEvent<HTMLElement>, value: string | null) => {
      if (value) {
        onToolChange(value as SketchTool);
      }
    },
    [onToolChange]
  );

  return (
    <FlexColumn className="sketch-toolbar" css={styles(theme)}>
      <FlexColumn className="tool-sections">
        {TOOLBAR_TOOL_GROUPS.map((group) => (
          <FlexColumn
            key={group.map((def) => def.tool).join("-")}
            className="tool-section"
          >
            <ToggleButtonGroup
              value={activeTool}
              exclusive
              onChange={handleToolChange}
              size="small"
              className="tool-group"
            >
              {group.map((definition) =>
                renderToolButton(definition, selectMode)
              )}
            </ToggleButtonGroup>
          </FlexColumn>
        ))}
      </FlexColumn>

      <Divider flexItem />

      {/* ── Colors ── */}
      <FlexColumn sx={{ px: SKETCH_SPACING.xs }}>
        <ColorSwatchPair
          foregroundColor={foregroundColor}
          backgroundColor={backgroundColor}
          onForegroundColorChange={onForegroundColorChange}
          onBackgroundColorChange={onBackgroundColorChange}
          onSwapColors={onSwapColors}
          onResetColors={onResetColors}
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(SketchToolbar);
