import React, { memo, useCallback, useMemo } from "react";
import { IconButton, Stack, Tooltip, Typography, Box } from "@mui/material";
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
  Work
} from "@mui/icons-material";

const AVAILABLE_TOOLS = [
  "search_email",
  "google_search",
  "google_news",
  "google_images",
  "google_lens",
  "google_maps",
  "google_shopping",
  "google_finance",
  "google_jobs",
  "browser",
  "chroma_hybrid_search",
  "google_image_generation",
  "openai_image_generation",
  "openai_text_to_speech"
];

const TOOL_DESCRIPTIONS: Record<string, string> = {
  search_email: "Search for emails",
  google_search: "Search Google",
  google_news: "Search Google News",
  google_images: "Search Google Images",
  google_lens: "Search Google Lens",
  google_maps: "Search Google Maps",
  google_shopping: "Search Google Shopping",
  google_finance: "Search Google Finance",
  google_jobs: "Search Google Jobs",
  browser: "Browse the web",
  chroma_hybrid_search: "Search for documents in the Chroma database",
  google_image_generation: "Generate images using Google's Gemini API",
  openai_image_generation:
    "Generate images using OpenAI's Image Generation API",
  openai_text_to_speech:
    "Convert text into spoken audio using OpenAI's Text-to-Speech API"
};

const TOOL_ICONS: Record<string, JSX.Element> = {
  google_search: <Search sx={{ fontSize: 18 }} />,
  google_news: <Newspaper sx={{ fontSize: 18 }} />,
  google_images: <ImageSearch sx={{ fontSize: 18 }} />,
  google_lens: <Camera sx={{ fontSize: 18 }} />,
  google_maps: <Map sx={{ fontSize: 18 }} />,
  google_shopping: <ShoppingCart sx={{ fontSize: 18 }} />,
  google_finance: <Analytics sx={{ fontSize: 18 }} />,
  google_jobs: <Work sx={{ fontSize: 18 }} />,
  browser: <Language sx={{ fontSize: 18 }} />,
  chroma_hybrid_search: <ManageSearch sx={{ fontSize: 18 }} />,
  google_image_generation: <Image sx={{ fontSize: 18 }} />,
  openai_image_generation: <Image sx={{ fontSize: 18 }} />,
  openai_text_to_speech: <VolumeUp sx={{ fontSize: 18 }} />,
  search_email: <MailOutline sx={{ fontSize: 18 }} />
};

interface ToolsSelectorProps {
  value: string[];
  onChange: (tools: string[]) => void;
}

const ToolsSelector: React.FC<ToolsSelectorProps> = ({ value, onChange }) => {
  const selectedTools = useMemo(() => value || [], [value]);

  const handleToggleTool = useCallback(
    (toolName: string) => {
      const newTools = selectedTools.includes(toolName)
        ? selectedTools.filter((name) => name !== toolName)
        : [...selectedTools, toolName];
      onChange(newTools);
    },
    [selectedTools, onChange]
  );

  return (
    <Box 
      sx={{ 
        display: "flex", 
        alignItems: "center", 
        gap: 1,
        padding: "8px 16px",
        backgroundColor: "background.paper",
        borderRadius: "20px",
        border: "1px solid",
        borderColor: "divider"
      }}
    >
      <Typography 
        variant="caption" 
        color="text.secondary" 
        sx={{ 
          minWidth: "fit-content",
          fontWeight: 500
        }}
      >
        Tools:
      </Typography>
      <Stack
        direction="row"
        spacing={0.5}
        flexWrap="wrap"
        sx={{ 
          flexGrow: 1,
          alignItems: "center"
        }}
      >
        {AVAILABLE_TOOLS.map((tool) => {
          const isSelected = selectedTools.includes(tool);
          return (
            <Tooltip
              title={TOOL_DESCRIPTIONS[tool] || tool}
              key={tool}
              placement="top"
            >
              <IconButton
                size="small"
                onClick={() => handleToggleTool(tool)}
                sx={{
                  padding: "2px",
                  minWidth: "28px",
                  height: "28px",
                  transition: "all 0.2s ease",
                  color: isSelected ? "primary.main" : "text.disabled",
                  backgroundColor: isSelected ? "action.selected" : "transparent",
                  borderRadius: "6px",
                  "&:hover": {
                    color: isSelected ? "primary.main" : "text.primary",
                    backgroundColor: isSelected ? "action.selected" : "action.hover"
                  }
                }}
              >
                {TOOL_ICONS[tool] || <Search sx={{ fontSize: 18 }} />}
              </IconButton>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
};

export default memo(ToolsSelector, isEqual);