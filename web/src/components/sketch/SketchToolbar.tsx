/**
 * SketchToolbar
 *
 * Narrow vertical icon toolbar for tool selection only.
 * All tool settings, colors, actions, and view controls live in SketchToolTopBar.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Box,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Divider
} from "@mui/material";
import BrushIcon from "@mui/icons-material/Brush";
import CreateIcon from "@mui/icons-material/Create";
import AutoFixNormalIcon from "@mui/icons-material/AutoFixNormal";
import ColorizeIcon from "@mui/icons-material/Colorize";
import FormatColorFillIcon from "@mui/icons-material/FormatColorFill";
import HorizontalRuleIcon from "@mui/icons-material/HorizontalRule";
import RectangleOutlinedIcon from "@mui/icons-material/RectangleOutlined";
import CircleOutlinedIcon from "@mui/icons-material/CircleOutlined";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import BlurOnIcon from "@mui/icons-material/BlurOn";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import GradientIcon from "@mui/icons-material/Gradient";
import CropIcon from "@mui/icons-material/Crop";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import TuneIcon from "@mui/icons-material/Tune";
import { SketchTool } from "./types";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    padding: "4px",
    backgroundColor: theme.vars.palette.grey[800],
    borderRight: `1px solid ${theme.vars.palette.grey[700]}`,
    width: "44px",
    overflowY: "auto",
    alignItems: "center",
    "& .tool-group": {
      display: "flex",
      flexDirection: "column",
      gap: "2px"
    },
    "& .MuiToggleButtonGroup-root": {
      flexDirection: "column"
    },
    "& .MuiToggleButton-root": {
      padding: "6px",
      minWidth: "32px",
      minHeight: "32px"
    }
  });

export interface SketchToolbarProps {
  activeTool: SketchTool;
  onToolChange: (tool: SketchTool) => void;
}

const SketchToolbar: React.FC<SketchToolbarProps> = ({
  activeTool,
  onToolChange
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
    <Box className="sketch-toolbar" css={styles(theme)}>
      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        className="tool-group"
      >
        <ToggleButton value="move" aria-label="Move">
          <Tooltip title="Move (V)" placement="right">
            <OpenWithIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="select" aria-label="Select">
          <Tooltip title="Select" placement="right">
            <SelectAllIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="brush" aria-label="Brush">
          <Tooltip title="Brush (B)" placement="right">
            <BrushIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="pencil" aria-label="Pencil">
          <Tooltip title="Pencil (P)" placement="right">
            <CreateIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="eraser" aria-label="Eraser">
          <Tooltip title="Eraser (E)" placement="right">
            <AutoFixNormalIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="fill" aria-label="Fill">
          <Tooltip title="Fill (G)" placement="right">
            <FormatColorFillIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="eyedropper" aria-label="Eyedropper">
          <Tooltip title="Eyedropper (I)" placement="right">
            <ColorizeIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="blur" aria-label="Blur Brush">
          <Tooltip title="Blur Brush (Q)" placement="right">
            <BlurOnIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="clone_stamp" aria-label="Clone Stamp">
          <Tooltip title="Clone Stamp (S) — Alt+click to set source" placement="right">
            <ContentCopyIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>

      <Divider flexItem />

      <ToggleButtonGroup
        value={activeTool}
        exclusive
        onChange={handleToolChange}
        size="small"
        className="tool-group"
      >
        <ToggleButton value="line" aria-label="Line">
          <Tooltip title="Line (L)" placement="right">
            <HorizontalRuleIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="rectangle" aria-label="Rectangle">
          <Tooltip title="Rectangle (R)" placement="right">
            <RectangleOutlinedIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="ellipse" aria-label="Ellipse">
          <Tooltip title="Ellipse (O)" placement="right">
            <CircleOutlinedIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="arrow" aria-label="Arrow">
          <Tooltip title="Arrow (A)" placement="right">
            <ArrowRightAltIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="gradient" aria-label="Gradient">
          <Tooltip title="Gradient (T)" placement="right">
            <GradientIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="crop" aria-label="Crop">
          <Tooltip title="Crop (C)" placement="right">
            <CropIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
        <ToggleButton value="adjust" aria-label="Adjustments">
          <Tooltip title="Adjustments (J)" placement="right">
            <TuneIcon fontSize="small" />
          </Tooltip>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

export default memo(SketchToolbar);
