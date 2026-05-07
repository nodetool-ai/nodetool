/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";

import React, { memo, useCallback, useMemo, useState, useRef } from "react";
import { DialogContent } from "@mui/material";
import { EditorButton } from "../../editor_ui";
import { Dialog, Tooltip, FlexRow } from "../../ui_primitives";
import isEqual from "fast-deep-equal";
import {
  Search,
  Language,
  Image,
  VolumeUp,
  Build,
  Check
} from "@mui/icons-material";
import { TOOLTIP_ENTER_DELAY } from "../../../config/constants";

const dialogStyles = (theme: Theme) =>
  css({
    ".tools-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
      gap: theme.spacing(2)
    },
    ".category-card": {
      border: `1px solid ${theme.vars.palette.grey[800]}`,
      borderRadius: 12,
      background: `linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)`,
      overflow: "hidden",
      transition: "border-color 160ms ease"
    },
    ".category-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(1.5, 2),
      color: theme.vars.palette.grey[300],
      fontSize: "0.7rem",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.08em"
    },
    ".category-dot": {
      width: 6,
      height: 6,
      borderRadius: "50%",
      background: theme.vars.palette.grey[500]
    },
    ".category-card.has-selected .category-dot": {
      background: "var(--palette-primary-main)",
      boxShadow: `0 0 8px var(--palette-primary-main)`
    },
    ".tools-list": {
      display: "flex",
      flexDirection: "column",
      padding: theme.spacing(0.5, 0.75, 0.75)
    },
    ".tool-item": {
      position: "relative",
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1.25),
      padding: theme.spacing(1, 1.25),
      borderRadius: 8,
      cursor: "pointer",
      transition:
        "background-color 160ms ease, transform 160ms ease, color 160ms ease",
      "&:hover": {
        backgroundColor: "rgba(255,255,255,0.04)"
      },
      "&.selected": {
        backgroundColor: "rgba(74, 123, 255, 0.10)",
        boxShadow: `inset 0 0 0 1px rgba(74, 123, 255, 0.35)`
      }
    },
    ".tool-icon-wrap": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 32,
      height: 32,
      flexShrink: 0,
      borderRadius: 8,
      background: theme.vars.palette.grey[800],
      color: theme.vars.palette.grey[100],
      transition: "background-color 160ms ease, color 160ms ease",
      "& svg": { fontSize: 18 }
    },
    ".tool-item.selected .tool-icon-wrap": {
      background: "var(--palette-primary-main)",
      color: theme.vars.palette.primary.contrastText
    },
    ".tool-text": {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      minWidth: 0,
      flex: 1
    },
    ".tool-name": {
      color: theme.vars.palette.grey[0],
      fontSize: "0.875rem",
      fontWeight: 500,
      lineHeight: 1.3
    },
    ".tool-item.selected .tool-name": {
      color: "var(--palette-primary-light)"
    },
    ".tool-description": {
      color: theme.vars.palette.grey[300],
      fontSize: "0.75rem",
      lineHeight: 1.4
    },
    ".tool-check": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 18,
      height: 18,
      borderRadius: "50%",
      flexShrink: 0,
      marginTop: 6,
      border: `1px solid ${theme.vars.palette.grey[600]}`,
      color: "transparent",
      transition: "all 160ms ease",
      "& svg": { fontSize: 14 }
    },
    ".tool-item:hover .tool-check": {
      borderColor: theme.vars.palette.grey[400]
    },
    ".tool-item.selected .tool-check": {
      background: "var(--palette-primary-main)",
      borderColor: "var(--palette-primary-main)",
      color: theme.vars.palette.primary.contrastText
    },
    ".tools-count-badge": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 18,
      height: 18,
      padding: "0 5px",
      marginLeft: theme.spacing(0.5),
      borderRadius: 9,
      fontSize: "0.7rem",
      fontWeight: 600,
      lineHeight: 1,
      background: "var(--palette-primary-main)",
      color: theme.vars.palette.primary.contrastText
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
    description: "Generate images with GPT-Image",
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
      "Browse the web — navigate, read pages, click links, fill forms.",
    category: "Utility",
    icon: <Language />,
    toolIds: ["browser"]
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

  const selectedCount = selectedToolEntries.length;

  return (
    <>
      <Tooltip
        title={
          selectedCount > 0
            ? `${selectedCount} tool${selectedCount === 1 ? "" : "s"} selected`
            : "Select tools"
        }
        delay={TOOLTIP_ENTER_DELAY}
      >
        <EditorButton
          ref={buttonRef}
          className={`tools-button ${selectedCount > 0 ? "active" : ""}`}
          onClick={handleClick}
          size="small"
          startIcon={<Build fontSize="small" />}
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
        >
          <FlexRow align="center" gap={0}>
            <span>Tools</span>
            {selectedCount > 0 && (
              <span
                css={css({
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  marginLeft: 6,
                  borderRadius: 9,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  lineHeight: 1,
                  background: "var(--palette-primary-main)",
                  color: theme.vars.palette.primary.contrastText
                })}
              >
                {selectedCount}
              </span>
            )}
          </FlexRow>
        </EditorButton>
      </Tooltip>
      <Dialog
        css={dialogStyles(theme)}
        className="tools-selector-dialog"
        open={isOpen}
        onClose={handleClose}
        title={
          selectedCount > 0
            ? `Tools · ${selectedCount} selected`
            : "Tools"
        }
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
            borderRadius: 2,
            background: theme.vars.palette.grey[900],
            border: `1px solid ${theme.vars.palette.grey[800]}`,
            boxShadow: "0 24px 60px rgba(0,0,0,0.55)"
          }
        })}
      >
        <DialogContent sx={{ background: "transparent", pt: 2, pb: 3 }}>
          <div className="tools-grid">
            {TOOL_CATEGORIES.map((category) => {
              const items = groupedTools[category] ?? [];
              const hasSelected = items.some((tool) =>
                isToolSelected(tool, value || [])
              );
              return (
                <div
                  key={category}
                  className={`category-card${hasSelected ? " has-selected" : ""}`}
                >
                  <div className="category-header">
                    <span className="category-dot" />
                    {category}
                  </div>
                  <div className="tools-list">
                    {items.map((tool) => {
                      const isSelected = isToolSelected(tool, value || []);
                      return (
                        <div
                          key={tool.id}
                          className={`tool-item${isSelected ? " selected" : ""}`}
                          onClick={toggleHandlers[tool.id]}
                          role="button"
                          aria-pressed={isSelected}
                        >
                          <span className="tool-icon-wrap">{tool.icon}</span>
                          <span className="tool-text">
                            <span className="tool-name">{tool.name}</span>
                            <span className="tool-description">
                              {tool.description}
                            </span>
                          </span>
                          <span className="tool-check">
                            <Check />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default memo(ToolsSelector, isEqual);
