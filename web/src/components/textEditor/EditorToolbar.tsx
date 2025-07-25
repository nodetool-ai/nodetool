/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo } from "react";
import { IconButton, Tooltip } from "@mui/material";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import WrapTextIcon from "@mui/icons-material/WrapText";
import SearchIcon from "@mui/icons-material/Search";
import CodeIcon from "@mui/icons-material/Code";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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
    padding: "0.2em 1em 0 1em",
    backgroundColor: "transparent",
    gap: "0.5em",
    minHeight: "2.5em",
    ".toolbar-group": {
      display: "flex",
      alignItems: "center",
      gap: "0.25em",
      "&:not(:last-child)": {
        borderRight: `1px solid ${theme.vars.palette.grey[600]}`,
        paddingRight: "0.5em",
        marginRight: "0.25em"
      }
    },
    ".toolbar-button": {
      padding: "2px",
      color: `${theme.vars.palette.grey[200]} !important`,
      backgroundColor: "transparent !important",
      borderRadius: "4px !important",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: `${theme.vars.palette.grey[800]} !important`,
        color: `${theme.vars.palette.grey[0]} !important`
      },
      "&.active": {
        backgroundColor: `${theme.vars.palette.grey[600]} !important`,
        color: `${theme.vars.palette.grey[0]} !important`
      },
      "&.disabled": {
        color: `${theme.vars.palette.grey[500]} !important`,
        cursor: "not-allowed",
        "&:hover": {
          backgroundColor: "transparent !important",
          color: `${theme.vars.palette.grey[500]} !important`
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
    <div className="editor-toolbar" css={styles}>
      {!readOnly && (
        <div className="toolbar-group">
          <Tooltip title="Undo" enterDelay={TOOLTIP_ENTER_DELAY}>
            <span>
              <IconButton
                className={`toolbar-button ${!canUndo ? "disabled" : ""}`}
                onClick={onUndo}
                disabled={!canUndo}
                size="small"
              >
                <UndoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Redo" enterDelay={TOOLTIP_ENTER_DELAY}>
            <span>
              <IconButton
                className={`toolbar-button ${!canRedo ? "disabled" : ""}`}
                onClick={onRedo}
                disabled={!canRedo}
                size="small"
              >
                <RedoIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </div>
      )}

      <div className="toolbar-group">
        <Tooltip title="Find & Replace" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="toolbar-button"
            onClick={onToggleFind}
            size="small"
          >
            <SearchIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <div className="toolbar-group">
        <Tooltip title="Toggle Word Wrap" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className={`toolbar-button ${wordWrapEnabled ? "active" : ""}`}
            onClick={onToggleWordWrap}
            size="small"
          >
            <WrapTextIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Format as Code Block" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className={`toolbar-button ${isCodeBlock ? "active" : ""}`}
            onClick={onFormatCodeBlock}
            size="small"
          >
            <CodeIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};

export default memo(EditorToolbar);
