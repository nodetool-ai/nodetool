import { memo, useCallback, useMemo } from "react";
import { IconButton, Stack, Tooltip } from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
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
  google_search: <Search fontSize="small" sx={{ mr: 0.5 }} />,
  google_news: <Newspaper fontSize="small" sx={{ mr: 0.5 }} />,
  google_images: <ImageSearch fontSize="small" sx={{ mr: 0.5 }} />,
  google_lens: <Camera fontSize="small" sx={{ mr: 0.5 }} />,
  google_maps: <Map fontSize="small" sx={{ mr: 0.5 }} />,
  google_shopping: <ShoppingCart fontSize="small" sx={{ mr: 0.5 }} />,
  google_finance: <Analytics fontSize="small" sx={{ mr: 0.5 }} />,
  google_jobs: <Work fontSize="small" sx={{ mr: 0.5 }} />,
  browser: <Language fontSize="small" sx={{ mr: 0.5 }} />,
  chroma_hybrid_search: <ManageSearch fontSize="small" sx={{ mr: 0.5 }} />,
  google_image_generation: <Image fontSize="small" sx={{ mr: 0.5 }} />,
  openai_image_generation: <Image fontSize="small" sx={{ mr: 0.5 }} />,
  openai_text_to_speech: <VolumeUp fontSize="small" sx={{ mr: 0.5 }} />,
  search_email: <MailOutline fontSize="small" sx={{ mr: 0.5 }} />
};

const ToolsListProperty = (props: PropertyProps) => {
  const id = `tools-list-${props.property.name}-${props.propertyIndex}`;
  const toolNames: string[] = useMemo(
    () => props.value?.map((tool: any) => tool.name) || [],
    [props.value]
  );

  const onChange = useCallback(
    (selectedToolNames: string[]) => {
      props.onChange(
        selectedToolNames.map((name) => ({ type: "tool_name", name }))
      );
    },
    [props]
  );

  const handleToggleTool = useCallback(
    (toolName: string) => {
      const newToolNames = toolNames.includes(toolName)
        ? toolNames.filter((name) => name !== toolName)
        : [...toolNames, toolName];
      onChange(newToolNames);
    },
    [toolNames, onChange]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />
      <Stack
        className="tools-list-items"
        direction="row"
        spacing={1}
        flexWrap="wrap"
        sx={{ mt: 1 }}
      >
        {AVAILABLE_TOOLS.map((tool) => {
          const isSelected = toolNames.includes(tool);
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
                  padding: "1px",
                  marginLeft: "0 !important",
                  transition: "color 0.2s ease",
                  color: isSelected ? "c_hl1" : "c_gray3",
                  "&:hover": {
                    color: isSelected ? "c_hl1" : "c_gray6"
                  }
                }}
              >
                {TOOL_ICONS[tool] || <Search fontSize="small" />}
              </IconButton>
            </Tooltip>
          );
        })}
      </Stack>
    </>
  );
};

export default memo(ToolsListProperty, isEqual);
