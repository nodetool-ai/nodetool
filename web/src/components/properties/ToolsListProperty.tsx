import React, { memo, useCallback, useMemo, useState } from "react";
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Checkbox
} from "@mui/material";
import { Tooltip, ToolbarIconButton, FlexRow } from "../ui_primitives";
import PropertyLabel from "../node/PropertyLabel";
import { PropertyProps } from "../node/PropertyInput";
import isEqual from "fast-deep-equal";

/**
 * Interface for a tool object in the tools list property
 */
interface Tool {
  type: string;
  name: string;
}
import {
  Search,
  Language,
  Add,
  Description,
  EditNote,
  Folder
} from "@mui/icons-material";

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

interface ToolEntry {
  /** Synthetic id for the menu row. */
  id: string;
  description: string;
  icon: React.JSX.Element;
  /** Underlying tool names this entry expands to. */
  toolIds: string[];
}

const AVAILABLE_TOOLS: ToolEntry[] = [
  {
    id: "read_file",
    description: "Read file in workspace",
    icon: <Description fontSize="small" sx={{ mr: 0.5 }} />,
    toolIds: ["read_file"]
  },
  {
    id: "write_file",
    description: "Write file in workspace",
    icon: <EditNote fontSize="small" sx={{ mr: 0.5 }} />,
    toolIds: ["write_file"]
  },
  {
    id: "list_directory",
    description: "List files in workspace",
    icon: <Folder fontSize="small" sx={{ mr: 0.5 }} />,
    toolIds: ["list_directory"]
  },
  {
    id: "google_search",
    description: "Search the web",
    icon: <Search fontSize="small" sx={{ mr: 0.5 }} />,
    toolIds: ["google_search"]
  },
  {
    id: "browser",
    description: "Browse the web",
    icon: <Language fontSize="small" sx={{ mr: 0.5 }} />,
    toolIds: BROWSER_TOOL_IDS
  }
];

const ToolsListProperty = (props: PropertyProps) => {
  const id = `tools-list-${props.property.name}-${props.propertyIndex}`;
  const toolNames: string[] = useMemo(
    () => props.value?.map((tool: Tool) => tool.name) || [],
    [props.value]
  );
  const toolNameSet = useMemo(() => new Set(toolNames), [toolNames]);

  const selectedEntries = useMemo(
    () =>
      AVAILABLE_TOOLS.filter((entry) =>
        entry.toolIds.every((tid) => toolNameSet.has(tid))
      ),
    [toolNameSet]
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

  const handleToolClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const entryId = event.currentTarget.dataset.tool;
      if (!entryId) return;
      const entry = AVAILABLE_TOOLS.find((t) => t.id === entryId);
      if (!entry) return;
      const isSelected = entry.toolIds.every((tid) => toolNameSet.has(tid));
      const memberSet = new Set(entry.toolIds);
      const next = isSelected
        ? toolNames.filter((n) => !memberSet.has(n))
        : [...toolNames.filter((n) => !memberSet.has(n)), ...entry.toolIds];
      onChange(next);
    },
    [toolNames, toolNameSet, onChange]
  );

  return (
    <>
      <PropertyLabel
        name={props.property.name}
        description={props.property.description}
        id={id}
      />

      {/* Selected tools row */}
      <FlexRow
        className="tools-list-items"
        gap={1}
        sx={{ mt: 1, flexWrap: "wrap" }}
      >
        {selectedEntries.map((entry) => (
          <ToolbarIconButton
            key={entry.id}
            tooltip={entry.description}
            tooltipPlacement="top"
            icon={entry.icon}
            size="small"
            onClick={handleToolClick}
            data-tool={entry.id}
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
          />
        ))}

        {/* Add (+) icon */}
        <ToolbarIconButton
          tooltip="Add / Remove Tools"
          tooltipPlacement="top"
          icon={<Add fontSize="small" />}
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
        />
      </FlexRow>

      {/* Menu for selecting tools */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {AVAILABLE_TOOLS.map((entry) => {
          const selected = entry.toolIds.every((tid) =>
            toolNameSet.has(tid)
          );
          return (
            <MenuItem
              key={entry.id}
              onClick={handleToolClick}
              data-tool={entry.id}
              dense
            >
              <ListItemIcon sx={{ minWidth: 24 }}>{entry.icon}</ListItemIcon>
              <ListItemText>{entry.description}</ListItemText>
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
