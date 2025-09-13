/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useCallback, memo } from "react";
import { IconButton, Collapse, Box, Fab } from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";
import ChatToolBar from "./ChatToolBar";
import { LanguageModel } from "../../../stores/ApiTypes";

const styles = (theme: Theme, isExpanded: boolean) =>
  css({
    position: "relative",
    width: "auto", // Auto width for inline layout
    display: "flex",
    flexDirection: "column",
    gap: "4px", // Reduced gap for compact layout

    ".toggle-button": {
      alignSelf: "center",
      width: "28px",
      height: "28px",
      backgroundColor: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[300],
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      borderRadius: "14px",
      boxShadow: "0 1px 4px rgba(0, 0, 0, 0.2)",
      transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      margin: "0",
      padding: "4px",

      "&:hover": {
        backgroundColor: theme.vars.palette.grey[700],
        borderColor: theme.vars.palette.grey[500],
        color: theme.vars.palette.grey[100],
        transform: "scale(1.05)"
      },

      "&:active": {
        transform: "scale(0.95)"
      },

      "& svg": {
        fontSize: "16px"
      }
    },

    ".toolbar-container": {
      marginLeft: "10%",
      width: "80%",
      backgroundColor: theme.vars.palette.grey[850],
      borderRadius: "12px",
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      padding: isExpanded ? "12px" : "0",
      boxShadow: isExpanded ? "0 4px 12px rgba(0, 0, 0, 0.3)" : "none",
      overflow: "hidden",
      transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
    },

    ".close-button": {
      position: "absolute",
      top: "8px",
      right: "20px",
      width: "28px",
      height: "28px",
      backgroundColor: theme.vars.palette.grey[700],
      color: theme.vars.palette.grey[300],
      zIndex: 1,

      "&:hover": {
        backgroundColor: theme.vars.palette.grey[600],
        color: theme.vars.palette.grey[100]
      },

      "& svg": {
        fontSize: "16px"
      }
    }
  });

interface MobileChatToolbarProps {
  selectedTools: string[];
  onToolsChange?: (tools: string[]) => void;
  selectedModel?: LanguageModel;
  onModelChange?: (model: LanguageModel) => void;
  agentMode?: boolean;
  onAgentModeToggle?: (enabled: boolean) => void;
  selectedCollections?: string[];
  onCollectionsChange?: (collections: string[]) => void;
}

const MobileChatToolbar: React.FC<MobileChatToolbarProps> = memo(
  ({
    selectedTools,
    onToolsChange,
    selectedModel,
    onModelChange,
    agentMode,
    onAgentModeToggle,
    selectedCollections,
    onCollectionsChange
  }) => {
    const theme = useTheme();
    const [isExpanded, setIsExpanded] = useState(false);

    const handleToggle = useCallback(() => {
      setIsExpanded((prev) => !prev);
    }, []);

    const handleClose = useCallback(() => {
      setIsExpanded(false);
    }, []);

    return (
      <Box css={styles(theme, isExpanded)} className="mobile-chat-toolbar">
        {!isExpanded ? (
          <IconButton
            className="toggle-button"
            onClick={handleToggle}
            aria-label="Open chat settings"
          >
            <SettingsIcon />
          </IconButton>
        ) : (
          <div className="toolbar-container">
            <IconButton
              className="close-button"
              onClick={handleClose}
              aria-label="Close chat settings"
            >
              <CloseIcon />
            </IconButton>
            <Collapse in={isExpanded} timeout={200}>
              <ChatToolBar
                selectedTools={selectedTools}
                onToolsChange={onToolsChange}
                selectedModel={selectedModel}
                onModelChange={onModelChange}
                agentMode={agentMode}
                onAgentModeToggle={onAgentModeToggle}
                selectedCollections={selectedCollections}
                onCollectionsChange={onCollectionsChange}
              />
            </Collapse>
          </div>
        )}
      </Box>
    );
  }
);

MobileChatToolbar.displayName = "MobileChatToolbar";

export default MobileChatToolbar;
