import React, { memo } from "react";
import { Box, List, ListItemButton, ListItemText, ToggleButton, ToggleButtonGroup } from "@mui/material";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { prettifyModelType } from "../ModelUtils";
import SearchInput from "../../search/SearchInput";

interface Props {
  modelTypes: string[];
  selectedModelType: string;
  onModelTypeChange: (type: string) => void;
  modelSource: "downloaded" | "recommended";
  onModelSourceChange: (
    event: React.MouseEvent<HTMLElement>,
    source: "downloaded" | "recommended" | null
  ) => void;
  viewMode: "grid" | "list";
  onViewModeChange: (event: React.MouseEvent<HTMLElement>, mode: "grid" | "list" | null) => void;
  modelSearchTerm: string;
  onSearchChange: (term: string) => void;
}

const ModelListSidebar: React.FC<Props> = ({
  modelTypes,
  selectedModelType,
  onModelTypeChange,
  modelSource,
  onModelSourceChange,
  viewMode,
  onViewModeChange,
  modelSearchTerm,
  onSearchChange
}) => (
  <Box className="sidebar">
    <Box className="model-list-header" sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
      <SearchInput focusOnTyping maxWidth="9em" onSearchChange={onSearchChange} searchTerm={modelSearchTerm} focusSearchInput={false} />
      <ToggleButtonGroup value={modelSource} exclusive onChange={onModelSourceChange} aria-label="model source" size="small" sx={{ marginLeft: 1 }}>
        <ToggleButton value="downloaded">Downloaded</ToggleButton>
        <ToggleButton value="recommended">Recommended</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup value={viewMode} exclusive onChange={onViewModeChange} aria-label="view mode">
        <ToggleButton value="grid" aria-label="grid view">
          <ViewModuleIcon />
        </ToggleButton>
        <ToggleButton value="list" aria-label="list view">
          <ViewListIcon />
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
    <List>
      {modelTypes.map((type) => (
        <ListItemButton className="model-type-button" key={type} selected={selectedModelType === type} onClick={() => onModelTypeChange(type)}>
          <ListItemText primary={prettifyModelType(type)} />
        </ListItemButton>
      ))}
    </List>
  </Box>
);

export default memo(ModelListSidebar);
