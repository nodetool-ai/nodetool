/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import { Box } from "@mui/material";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import WrapTextIcon from "@mui/icons-material/WrapText";
import SearchIcon from "@mui/icons-material/Search";
import CodeIcon from "@mui/icons-material/Code";
import { ToolbarIconButton } from "../ui_primitives";

interface EditorToolbarProps {
  onUndo?: () => void;
  onRedo?: () => void;
  onToggleWordWrap?: () => void;
  onToggleFind?: () => void;
  onFormatCodeBlock?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  wordWrapEnabled?: boolean;
  isCodeBlock?: boolean;
  readOnly?: boolean;
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    padding: "0.15em 1.25em",
    backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.25)`,
    gap: "0.4em",
    minHeight: "2.4em",
    borderBottom: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.03)`,
    ".toolbar-group": {
      display: "flex",
      alignItems: "center",
      gap: "0.2em",
      "&:not(:last-child)": {
        borderRight: "none",
        paddingRight: "0.4em",
        marginRight: "0.2em",
        position: "relative",
        "&::after": {
          content: "''",
          position: "absolute",
          right: 0,
          top: "20%",
          bottom: "20%",
          width: "1px",
          background: `linear-gradient(180deg,
            transparent,
            rgba(${theme.vars.palette.common.whiteChannel} / 0.1) 50%,
            transparent)`
        }
      }
    },
    ".toolbar-button": {
      padding: "3px",
      color: `${theme.vars.palette.grey[300]} !important`,
      backgroundColor: "transparent !important",
      borderRadius: "8px !important",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
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
  canUndo = false,
  canRedo = false,
  wordWrapEnabled = true,
  isCodeBlock = false,
  readOnly = false
}: EditorToolbarProps) => {
  const theme = useTheme();

  return (
    <Box className="editor-toolbar" css={styles(theme)}>
      {!readOnly && (
        <div className="toolbar-group">
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
        </div>
      )}

      <div className="toolbar-group">
        <ToolbarIconButton
          icon={<SearchIcon fontSize="small" />}
          tooltip="Find & Replace"
          className="toolbar-button"
          onClick={onToggleFind}
          size="small"
        />
      </div>

      <div className="toolbar-group">
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
      </div>
    </Box>
  );
};

export default memo(EditorToolbar);
