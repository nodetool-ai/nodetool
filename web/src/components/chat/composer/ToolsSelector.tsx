/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";

import React, { memo, useCallback, useMemo, useState, useRef } from "react";
import {
  Button,
  Typography,
  Box,
  Tooltip,
  ListItemIcon,
  ListItemText,
  IconButton,
  Dialog,
  DialogContent,
  DialogTitle
} from "@mui/material";
import isEqual from "lodash/isEqual";
import {
  MailOutline,
  Search,
  Newspaper,
  ImageSearch,
  Language,
  ManageSearch,
  Image,
  VolumeUp,
  Camera,
  Map,
  ShoppingCart,
  Analytics,
  Work,
  Build
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
  id: string;
  name: string;
  description: string;
  category: string;
  icon: JSX.Element;
}

const TOOLS: Tool[] = [
  // Search Tools
  {
    id: "google_search",
    name: "Google Search",
    description: "Search the web with Google",
    category: "Search",
    icon: <Search />
  },
  {
    id: "google_news",
    name: "Google News",
    description: "Search for news articles",
    category: "Search",
    icon: <Newspaper />
  },
  {
    id: "google_images",
    name: "Google Images",
    description: "Search for images",
    category: "Search",
    icon: <ImageSearch />
  },
  {
    id: "google_lens",
    name: "Google Lens",
    description: "Visual search with Google Lens",
    category: "Search",
    icon: <Camera />
  },
  {
    id: "google_maps",
    name: "Google Maps",
    description: "Search locations and directions",
    category: "Search",
    icon: <Map />
  },
  {
    id: "google_shopping",
    name: "Google Shopping",
    description: "Search for products",
    category: "Search",
    icon: <ShoppingCart />
  },
  {
    id: "google_finance",
    name: "Google Finance",
    description: "Search financial information",
    category: "Search",
    icon: <Analytics />
  },
  {
    id: "google_jobs",
    name: "Google Jobs",
    description: "Search for job listings",
    category: "Search",
    icon: <Work />
  },
  {
    id: "search_email",
    name: "Email Search",
    description: "Search through emails",
    category: "Search",
    icon: <MailOutline />
  },
  {
    id: "chroma_hybrid_search",
    name: "Document Search",
    description: "Search documents in Chroma database",
    category: "Search",
    icon: <ManageSearch />
  },
  // Generation Tools
  {
    id: "google_image_generation",
    name: "Google Image Gen",
    description: "Generate images with Google Gemini",
    category: "Generation",
    icon: <Image />
  },
  {
    id: "openai_image_generation",
    name: "OpenAI Image Gen",
    description: "Generate images with DALL-E",
    category: "Generation",
    icon: <Image />
  },
  {
    id: "openai_text_to_speech",
    name: "Text to Speech",
    description: "Convert text to spoken audio",
    category: "Generation",
    icon: <VolumeUp />
  },
  // Utility Tools
  {
    id: "browser",
    name: "Web Browser",
    description: "Browse and interact with web pages",
    category: "Utility",
    icon: <Language />
  }
];

const TOOL_CATEGORIES = ["Search", "Generation", "Utility"];

interface ToolsSelectorProps {
  value: string[];
  onChange: (tools: string[]) => void;
}

const ToolsSelector: React.FC<ToolsSelectorProps> = ({ value, onChange }) => {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selectedTools = useMemo(() => {
    const toolIds = new Set(TOOLS.map((tool) => tool.id));
    return (value || []).filter((toolId) => toolIds.has(toolId));
  }, [value]);

  const handleClick = useCallback(() => {
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleToggleTool = useCallback(
    (toolId: string) => {
      const newTools = selectedTools.includes(toolId)
        ? selectedTools.filter((id) => id !== toolId)
        : [...selectedTools, toolId];
      onChange(newTools);
    },
    [selectedTools, onChange]
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

  const selectedToolIcons = useMemo(() => {
    return selectedTools
      .map((toolId) => TOOLS.find((tool) => tool.id === toolId))
      .filter((tool): tool is Tool => tool !== undefined)
      .slice(0, 3);
  }, [selectedTools]);

  return (
    <>
      <Tooltip
        title={
          selectedTools.length > 0
            ? `${selectedTools.length} tools selected`
            : "Select Tools"
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          ref={buttonRef}
          className={`tools-button ${selectedTools.length > 0 ? "active" : ""}`}
          onClick={handleClick}
          size="small"
          startIcon={
            selectedToolIcons.length > 0 ? (
              <Box sx={{ display: "flex", gap: "2px" }}>
                {selectedToolIcons.map((tool) => (
                  <Box
                    key={tool.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      "& > svg": { fontSize: "16px" }
                    }}
                  >
                    {tool.icon}
                  </Box>
                ))}
                {selectedTools.length > 3 && (
                  <Typography
                    variant="caption"
                    sx={{ fontSize: "12px", ml: 0.5 }}
                  >
                    +{selectedTools.length - 3}
                  </Typography>
                )}
              </Box>
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
        ></Button>
      </Tooltip>
      <Dialog
        css={dialogStyles(theme)}
        className="tools-selector-dialog"
        open={isOpen}
        onClose={handleClose}
        aria-labelledby="tools-selector-title"
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
        <DialogTitle className="dialog-title">
          <Typography variant="h4" id="tools-selector-title">
            Tools
          </Typography>
          <Tooltip title="Close">
            <IconButton
              aria-label="close"
              onClick={handleClose}
              className="close-button"
            >
              <Build />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent sx={{ background: "transparent", pt: 2 }}>
          <div className="tools-grid">
            {TOOL_CATEGORIES.map((category) => (
              <div key={category} className="category-card">
                <div className="category-header">{category}</div>
                <div className="tools-list">
                  {groupedTools[category]?.map((tool) => {
                    const isSelected = selectedTools.includes(tool.id);
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
