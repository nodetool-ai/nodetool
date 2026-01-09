/** @jsxImportSource @emotion/react */
import React from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Tooltip, IconButton } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { isMac } from "../../../utils/platform";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface UndoRedoButtonsProps {}

const styles = (_theme: Theme) =>
  css({
    display: "flex",
    alignItems: "center",
    gap: 4
  });

export const UndoRedoButtons: React.FC<UndoRedoButtonsProps> = () => {
  const theme = useTheme();
  const undo = useGlobalChatStore((state) => state.undo);
  const redo = useGlobalChatStore((state) => state.redo);

  // Check if we can undo/redo by accessing the history
  const chatHistory = useGlobalChatStore((state) => state.chatHistory);
  const chatHistoryIndex = useGlobalChatStore((state) => state.chatHistoryIndex);
  const canUndo = chatHistoryIndex > 0;
  const canRedo = chatHistoryIndex < chatHistory.length - 1;

  const modifierKey = isMac() ? "⌘" : "Ctrl";

  return (
    <div css={styles(theme)} className="undo-redo-buttons">
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          <div style={{ textAlign: "center" }}>
            <div>Undo</div>
            <div>{modifierKey}+Z</div>
          </div>
        }
      >
        <span>
          <IconButton
            size="small"
            onClick={undo}
            disabled={!canUndo}
            sx={{
              opacity: canUndo ? 1 : 0.5,
              "&.Mui-disabled": {
                opacity: 0.3
              }
            }}
            aria-label="Undo"
          >
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title={
          <div style={{ textAlign: "center" }}>
            <div>Redo</div>
            <div>{modifierKey}+Shift+Z</div>
          </div>
        }
      >
        <span>
          <IconButton
            size="small"
            onClick={redo}
            disabled={!canRedo}
            sx={{
              opacity: canRedo ? 1 : 0.5,
              "&.Mui-disabled": {
                opacity: 0.3
              }
            }}
            aria-label="Redo"
          >
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </div>
  );
};

export default UndoRedoButtons;
