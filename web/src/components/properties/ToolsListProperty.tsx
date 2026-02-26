import React, { memo, useCallback, useMemo, useState } from "react";
import {
  IconButton,
  Stack,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Checkbox
} from "@mui/material";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "lodash/isEqual";

/**
 * Interface for a tool object in the tools list property
 */
interface Tool {
  type: string;
  name: string;
}
import {
  MailOutline,
  Search,
  Newspaper,
  ImageSearch,
  Language,
  ManageSearch,
  Camera,
  Map,
  ShoppingCart,
  Analytics,
  Work,
  Add,
  Description,
  EditNote,
  Folder
} from "@mui/icons-material";

const AVAILABLE_TOOLS = [
  "read_file",
  "write_file",
  "list_directory",
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
];

const TOOL_DESCRIPTIONS: Record<string, string> = {
  read_file: "Read file in workspace",
  write_file: "Write file in workspace",
  list_directory: "List files in workspace",
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
};

const TOOL_ICONS: Record<string, JSX.Element> = {
  read_file: <Description fontSize="small" sx={{ mr: 0.5 }} />,
  write_file: <EditNote fontSize="small" sx={{ mr: 0.5 }} />,
  list_directory: <Folder fontSize="small" sx={{ mr: 0.5 }} />,
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
  search_email: <MailOutline fontSize="small" sx={{ mr: 0.5 }} />
};

const ToolsListProperty = (props: PropertyProps) => {
  const id = `tools-list-${props.property.name}-${props.propertyIndex}`;
  const toolNames: string[] = useMemo(
    () => props.value?.map((tool: Tool) => tool.name) || [],
    [props.value]
  );

  // Anchor element for the add/select menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const openMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchor(event.currentTarget);
  }, []);

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

  const handleToolClick = useCallback(
    (toolName: string) => () => {
      handleToggleTool(toolName);
    },
    [handleToggleTool]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      {/* Selected tools row */}
      <Stack
        className="tools-list-items"
        direction="row"
        spacing={1}
        flexWrap="wrap"
        sx={{ mt: 1 }}
      >
        {toolNames.map((tool) => (
          <Tooltip
            key={tool}
            title={TOOL_DESCRIPTIONS[tool] || tool}
            placement="top"
          >
            <IconButton
              size="small"
              onClick={handleToolClick(tool)}
              sx={{
                padding: "1px",
                marginLeft: "0 !important",
                transition: "color 0.2s ease",
                color: "c_hl1",
                "&:hover": {
                  color: "c_hl1"
                },
                "& svg": {
                  fontSize: "15px"
                }
              }}
            >
              {TOOL_ICONS[tool] || <Search fontSize="small" />}
            </IconButton>
          </Tooltip>
        ))}

        {/* Add (+) icon */}
        <Tooltip title="Add / Remove Tools" placement="top">
          <IconButton
            size="small"
            onClick={openMenu}
            sx={{
              padding: "1px",
              marginLeft: "0 !important",
              color: "palette-grey-400",
              "&:hover": {
                color: "palette-grey-100"
              },
              "& svg": {
                fontSize: "15px"
              }
            }}
          >
            <Add fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Menu for selecting tools */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {AVAILABLE_TOOLS.map((tool) => {
          const selected = toolNames.includes(tool);
          return (
            <MenuItem key={tool} onClick={handleToolClick(tool)} dense>
              <ListItemIcon sx={{ minWidth: 24 }}>
                {TOOL_ICONS[tool] || <Search fontSize="small" />}
              </ListItemIcon>
              <ListItemText>{TOOL_DESCRIPTIONS[tool] || tool}</ListItemText>
              <Checkbox
                checked={selected}
                size="small"
                sx={{ p: 0, ml: 1 }}
                disableRipple
              />
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
};

export default memo(ToolsListProperty, isEqual);
