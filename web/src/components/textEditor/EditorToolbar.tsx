/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import WrapTextIcon from "@mui/icons-material/WrapText";
import SearchIcon from "@mui/icons-material/Search";
import CodeIcon from "@mui/icons-material/Code";
import TitleIcon from "@mui/icons-material/Title";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import { Toolbar, ToolbarDivider, ToolbarGroup, ToolbarIconButton, MOTION, BORDER_RADIUS } from "../ui_primitives";

interface EditorToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleWordWrap?: () => void;
  onToggleFind?: () => void;
  onFormatCodeBlock?: () => void;
  /** Markdown formatting; the group renders only when these are provided. */
  onHeading?: () => void;
  onBold?: () => void;
  onBulletList?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  wordWrapEnabled?: boolean;
  isCodeBlock?: boolean;
  readOnly?: boolean;
}

const styles = (theme: Theme) =>
  css({
    ".toolbar-button": {
      padding: theme.spacing(1),
      color: `${theme.vars.palette.grey[300]} !important`,
      backgroundColor: "transparent !important",
      borderRadius: `${BORDER_RADIUS.lg} !important`,
      transition: `${MOTION.all} !important`,
      "&:hover": {
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.1) !important`,
        color: `${theme.vars.palette.grey[100]} !important`,
        boxShadow: `0 0 8px rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`
      },
      "&.active": {
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.18) !important`,
        color: `${theme.vars.palette.primary.light} !important`,
        boxShadow: `inset 0 1px 2px rgba(0,0,0,0.15)`
      },
      "&.disabled": {
        color: `${theme.vars.palette.grey[600]} !important`,
        cursor: "not-allowed",
        opacity: 0.5,
        "&:hover": {
          backgroundColor: "transparent !important",
          color: `${theme.vars.palette.grey[600]} !important`,
          boxShadow: "none"
        }
      }
    }
  });

const EditorToolbar = ({
  onUndo,
  onRedo,
  onToggleWordWrap,
  onToggleFind,
  onFormatCodeBlock,
  onHeading,
  onBold,
  onBulletList,
  canUndo = false,
  canRedo = false,
  wordWrapEnabled = true,
  isCodeBlock = false,
  readOnly = false
}: EditorToolbarProps) => {
  const theme = useTheme();

  return (
    <Toolbar className="editor-toolbar" density="compact" css={styles(theme)}>
      {!readOnly && (
        <ToolbarGroup>
          <ToolbarIconButton
            icon={<UndoIcon fontSize="small" />}
            tooltip="Undo"
            className={`toolbar-button ${!canUndo ? "disabled" : ""}`}
            onClick={onUndo}
            disabled={!canUndo}
            size="small"
          />
          <ToolbarIconButton
            icon={<RedoIcon fontSize="small" />}
            tooltip="Redo"
            className={`toolbar-button ${!canRedo ? "disabled" : ""}`}
            onClick={onRedo}
            disabled={!canRedo}
            size="small"
          />
        </ToolbarGroup>
      )}
      {!readOnly && <ToolbarDivider />}

      {!readOnly && onHeading && onBold && onBulletList && (
        <>
          <ToolbarGroup>
            <ToolbarIconButton
              icon={<TitleIcon fontSize="small" />}
              tooltip="Heading"
              className="toolbar-button"
              onClick={onHeading}
              size="small"
            />
            <ToolbarIconButton
              icon={<FormatBoldIcon fontSize="small" />}
              tooltip="Bold"
              className="toolbar-button"
              onClick={onBold}
              size="small"
            />
            <ToolbarIconButton
              icon={<FormatListBulletedIcon fontSize="small" />}
              tooltip="Bulleted list"
              className="toolbar-button"
              onClick={onBulletList}
              size="small"
            />
          </ToolbarGroup>
          <ToolbarDivider />
        </>
      )}

      <ToolbarGroup>
        <ToolbarIconButton
          icon={<SearchIcon fontSize="small" />}
          tooltip="Find & Replace"
          className="toolbar-button"
          onClick={onToggleFind}
          size="small"
        />
      </ToolbarGroup>
      <ToolbarDivider />

      <ToolbarGroup>
        <ToolbarIconButton
          icon={<WrapTextIcon fontSize="small" />}
          tooltip="Toggle Word Wrap"
          className={`toolbar-button ${wordWrapEnabled ? "active" : ""}`}
          onClick={onToggleWordWrap}
          size="small"
        />
        <ToolbarIconButton
          icon={<CodeIcon fontSize="small" />}
          tooltip="Format as Code Block"
          className={`toolbar-button ${isCodeBlock ? "active" : ""}`}
          onClick={onFormatCodeBlock}
          size="small"
        />
      </ToolbarGroup>
    </Toolbar>
  );
};

export default memo(EditorToolbar);
