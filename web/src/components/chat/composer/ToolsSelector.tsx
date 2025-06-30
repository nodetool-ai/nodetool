/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useMemo, useState, useRef } from "react";
import {
  Button,
  Menu,
  MenuItem,
  Typography,
  Box,
  Tooltip,
  Divider,
  ListItemIcon,
  ListItemText
} from "@mui/material";
import { isEqual } from "lodash";
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

const menuStyles = (theme: any) =>
  css({
    ".category-header": {
      padding: "8px 16px",
      backgroundColor: theme.palette.grey[600],
      color: theme.palette.grey[200],
      fontSize: "0.75rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em"
    },

    ".tool-item": {
      "&:hover": {
        backgroundColor: theme.palette.grey[600]
      },
      "&.selected": {
        backgroundColor: theme.palette.grey[600],
        borderLeft: `3px solid ${theme.palette.c_hl1}`,
        paddingLeft: "13px"
      }
    },

    ".tool-name": {
      color: theme.palette.c_white
    },

    ".tool-name.selected": {
      color: theme.palette.c_hl1
    },

    ".tool-description": {
      color: theme.palette.grey[200],
      fontSize: "0.75rem"
    },

    ".tool-icon": {
      color: theme.palette.grey[100]
    },

    ".tool-icon.selected": {
      color: theme.palette.c_hl1
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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);
  const selectedTools = useMemo(() => {
    const toolIds = new Set(TOOLS.map((tool) => tool.id));
    return (value || []).filter((toolId) => toolIds.has(toolId));
  }, [value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
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
      .filter(Boolean)
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
                    key={tool!.id}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      "& > svg": { fontSize: "16px" }
                    }}
                  >
                    {tool!.icon}
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
            color: theme.palette.c_white,
            "&:hover": {
              backgroundColor: theme.palette.grey[500],
              borderColor: theme.palette.grey[400]
            },
            "&.active": {
              borderColor: theme.palette.c_hl1,
              color: theme.palette.c_hl1
            }
          })}
        ></Button>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        css={menuStyles}
        anchorOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
      >
        {TOOL_CATEGORIES.map((category, index) => [
          index > 0 && <Divider key={`divider-${category}`} />,
          <Typography key={`header-${category}`} className="category-header">
            {category}
          </Typography>,
          ...(groupedTools[category]?.map((tool) => {
            const isSelected = selectedTools.includes(tool.id);
            return (
              <MenuItem
                key={tool.id}
                onClick={() => handleToggleTool(tool.id)}
                className={`tool-item ${isSelected ? "selected" : ""}`}
              >
                <ListItemIcon
                  className={`tool-icon ${isSelected ? "selected" : ""}`}
                >
                  {tool.icon}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <span
                      className={`tool-name ${isSelected ? "selected" : ""}`}
                    >
                      {tool.name}
                    </span>
                  }
                  secondary={
                    <span className="tool-description">{tool.description}</span>
                  }
                />
              </MenuItem>
            );
          }) || [])
        ])}
      </Menu>
    </>
  );
};

export default memo(ToolsSelector, isEqual);
