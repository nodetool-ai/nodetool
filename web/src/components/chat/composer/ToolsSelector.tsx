/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";

import React, { memo, useCallback, useMemo, useState, useRef } from "react";
import {
  ListItemIcon,
  ListItemText,
  DialogContent
} from "@mui/material";
import { EditorButton } from "../../editor_ui";
import { Dialog, Tooltip, Text, Caption, FlexRow, ToolbarIconButton } from "../../ui_primitives";
import isEqual from "fast-deep-equal";
import {
  Search,
  Language,
  Image,
  VolumeUp,
  Build,
  Lock
} from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

const dialogStyles = (theme: Theme) =>
  css({
    ".dialog-title": {
      position: "sticky",
      top: 0,
      zIndex: 2,
      background: "transparent",
      margin: 0,
      padding: theme.spacing(4, 4),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`
    },
    ".close-button": {
      position: "absolute",
      right: theme.spacing(1),
      top: theme.spacing(2),
      color: theme.vars.palette.grey[500]
    },
    ".tools-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: theme.spacing(2)
    },
    ".category-card": {
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      borderRadius: 8,
      background: "transparent"
    },
    ".category-header": {
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      color: theme.vars.palette.grey[100],
      fontSize: "0.8rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },
    ".tools-list": {
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(0.5, 0)
    },
    ".tool-item": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 1.5),
      cursor: "pointer",
      transition: "background-color 0.2s ease",
      "&:hover": {
        backgroundColor: theme.vars.palette.grey[800]
      },
      "&.selected": {
        backgroundColor: theme.vars.palette.grey[800],
        borderLeft: `3px solid var(--palette-primary-main)`,
        paddingLeft: theme.spacing(1.25)
      }
    },
    ".tool-name": {
      color: theme.vars.palette.grey[0]
    },
    ".tool-name.selected": {
      color: "var(--palette-primary-main)"
    },
    ".tool-description": {
      color: theme.vars.palette.grey[200],
      fontSize: "0.75rem"
    },
    ".tool-icon": {
      color: theme.vars.palette.grey[100]
    },
    ".tool-icon.selected": {
      color: "var(--palette-primary-main)"
    }
  });

interface Tool {
  /** Synthetic UI id; identical to `toolIds[0]` for single-tool entries. */
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.JSX.Element;
  /** Backend tool ids this entry expands to. A group selects/deselects them all together. */
  toolIds: string[];
}

const BROWSER_TOOL_IDS = [
  "browser_view",
  "browser_navigate",
  "browser_restart",
  "browser_click",
  "browser_input_text",
  "browser_move_mouse",
  "browser_press_key",
  "browser_select_option",
  "browser_scroll",
  "browser_console_exec",
  "browser_console_view"
];

const SANDBOX_TOOL_IDS = [
  "sandbox_shell_exec",
  "sandbox_shell_wait",
  "sandbox_shell_view",
  "sandbox_shell_write",
  "sandbox_shell_kill",
  "sandbox_file_read",
  "sandbox_file_write",
  "sandbox_file_str_replace",
  "sandbox_file_find_in_content",
  "sandbox_file_find_by_name",
  "sandbox_browser_view",
  "sandbox_browser_navigate",
  "sandbox_browser_restart",
  "sandbox_browser_click",
  "sandbox_browser_input_text",
  "sandbox_browser_move_mouse",
  "sandbox_browser_press_key",
  "sandbox_browser_select_option",
  "sandbox_browser_scroll",
  "sandbox_browser_console_exec",
  "sandbox_browser_console_view"
];

const TOOLS: Tool[] = [
  {
    id: "google_search",
    name: "Web Search",
    description: "Search the web with Google",
    category: "Search",
    icon: <Search />,
    toolIds: ["google_search"]
  },
  {
    id: "google_image_generation",
    name: "Google Image Gen",
    description: "Generate images with Google Gemini",
    category: "Generation",
    icon: <Image />,
    toolIds: ["google_image_generation"]
  },
  {
    id: "openai_image_generation",
    name: "OpenAI Image Gen",
    description: "Generate images with DALL-E",
    category: "Generation",
    icon: <Image />,
    toolIds: ["openai_image_generation"]
  },
  {
    id: "openai_text_to_speech",
    name: "Text to Speech",
    description: "Convert text to spoken audio",
    category: "Generation",
    icon: <VolumeUp />,
    toolIds: ["openai_text_to_speech"]
  },
  {
    id: "browser",
    name: "Web Browser",
    description:
      "Full browser control: navigate, view, click, input, scroll, run JS, and read the console.",
    category: "Utility",
    icon: <Language />,
    toolIds: BROWSER_TOOL_IDS
  },
  {
    id: "sandbox",
    name: "Sandbox",
    description: "Shell, files, and browser running in an isolated container.",
    category: "Utility",
    icon: <Lock />,
    toolIds: SANDBOX_TOOL_IDS
  }
];

const TOOL_CATEGORIES = ["Search", "Generation", "Utility"];

interface ToolsSelectorProps {
  value: string[];
  onChange: (tools: string[]) => void;
}

const isToolSelected = (tool: Tool, value: string[]): boolean =>
  tool.toolIds.every((id) => value.includes(id));

const ToolsSelector: React.FC<ToolsSelectorProps> = ({ value, onChange }) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedToolEntries = useMemo(
    () => TOOLS.filter((tool) => isToolSelected(tool, value || [])),
    [value]
  );

  const handleClick = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleToggleTool = useCallback(
    (toolId: string) => {
      const tool = TOOLS.find((t) => t.id === toolId);
      if (!tool) return;
      const current = value || [];
      const isSelected = isToolSelected(tool, current);
      const memberSet = new Set(tool.toolIds);
      const next = isSelected
        ? current.filter((id) => !memberSet.has(id))
        : [...current.filter((id) => !memberSet.has(id)), ...tool.toolIds];
      onChange(next);
    },
    [value, onChange]
  );

  // Memoize toggle handlers for each tool to prevent re-renders
  const toggleHandlers = useMemo(() => {
    const handlers: Record<string, () => void> = {};
    for (const tool of TOOLS) {
      handlers[tool.id] = () => handleToggleTool(tool.id);
    }
    return handlers;
  }, [handleToggleTool]);

  const groupedTools = useMemo(() => {
    return TOOLS.reduce<Record<string, Tool[]>>((acc, tool) => {
      if (!acc[tool.category]) {
        acc[tool.category] = [];
      }
      acc[tool.category].push(tool);
      return acc;
    }, {});
  }, []);

  const selectedToolIcons = useMemo(
    () => selectedToolEntries.slice(0, 3),
    [selectedToolEntries]
  );

  return (
    <>
      <Tooltip
        title={
          selectedToolEntries.length > 0
            ? `${selectedToolEntries.length} tools selected`
            : "Select Tools"
        }
        delay={TOOLTIP_ENTER_DELAY}
      >
        <EditorButton
          ref={buttonRef}
          className={`tools-button ${
            selectedToolEntries.length > 0 ? "active" : ""
          }`}
          onClick={handleClick}
          size="small"
          startIcon={
            selectedToolIcons.length > 0 ? (
              <FlexRow gap={0.5}>
                {selectedToolIcons.map((tool) => (
                  <FlexRow
                    key={tool.id}
                    align="center"
                    sx={{
                      "& > svg": { fontSize: "16px" }
                    }}
                  >
                    {tool.icon}
                  </FlexRow>
                ))}
                {selectedToolEntries.length > 3 && (
                  <Caption sx={{ fontSize: "12px", ml: 0.5 }}>
                    +{selectedToolEntries.length - 3}
                  </Caption>
                )}
              </FlexRow>
            ) : (
              <Build fontSize="small" />
            )
          }
          sx={(theme) => ({
            color: theme.vars.palette.grey[0],
            "&:hover": {
              backgroundColor: theme.vars.palette.grey[500],
              borderColor: theme.vars.palette.grey[400]
            },
            "&.active": {
              borderColor: "var(--palette-primary-main)",
              color: "var(--palette-primary-main)"
            }
          })}
        />
      </Tooltip>
      <Dialog
        css={dialogStyles(theme)}
        className="tools-selector-dialog"
        open={isOpen}
        onClose={handleClose}
        title="Tools"
        slotProps={{
          backdrop: {
            style: { backdropFilter: "blur(20px)" }
          }
        }}
        sx={(theme) => ({
          "& .MuiDialog-paper": {
            width: "92%",
            maxWidth: "1000px",
            margin: "auto",
            borderRadius: 1.5,
            background: "transparent",
            border: `1px solid ${theme.vars.palette.grey[700]}`
          }
        })}
      >
        <DialogContent sx={{ background: "transparent", pt: 2 }}>
          <div className="tools-grid">
            {TOOL_CATEGORIES.map((category) => (
              <div key={category} className="category-card">
                <div className="category-header">{category}</div>
                <div className="tools-list">
                  {groupedTools[category]?.map((tool) => {
                    const isSelected = isToolSelected(tool, value || []);
                    return (
                      <div
                        key={tool.id}
                        className={`tool-item ${isSelected ? "selected" : ""}`}
                        onClick={toggleHandlers[tool.id]}
                      >
                        <ListItemIcon
                          className={`tool-icon ${
                            isSelected ? "selected" : ""
                          }`}
                          sx={{ minWidth: 32 }}
                        >
                          {tool.icon}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <span
                              className={`tool-name ${
                                isSelected ? "selected" : ""
                              }`}
                            >
                              {tool.name}
                            </span>
                          }
                          secondary={
                            <span className="tool-description">
                              {tool.description}
                            </span>
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default memo(ToolsSelector, isEqual);
