import React, { useMemo, useState } from "react";
import {
  Grid,
  List,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Box,
  TextField,
  InputAdornment
} from "@mui/material";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import SearchIcon from "@mui/icons-material/Search";
import { UnifiedModel } from "../../stores/ApiTypes";
import ModelCard from "./ModelCard";
import ModelListItem from "./ModelListItem";
import ThemeNodes from "../themes/ThemeNodes";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { useModelsWithSize } from "../../hooks/useModelsWithSize";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";

interface RecommendedModelsProps {
  recommendedModels: UnifiedModel[];
  showViewModeToggle?: boolean;
  initialViewMode: "grid" | "list";
  compactView?: boolean;
}

const RecommendedModels: React.FC<RecommendedModelsProps> = ({
  recommendedModels,
  initialViewMode,
  showViewModeToggle = true,
  compactView = false
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);
  const [searchQuery, setSearchQuery] = useState("");
  const modelsWithSize = useModelsWithSize(recommendedModels);
  const startDownload = useModelDownloadStore((state) => state.startDownload);

  const handleViewModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newViewMode: "grid" | "list" | null
  ) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  const filteredModels = useMemo(() => {
    if (!searchQuery) return modelsWithSize;
    const query = searchQuery.toLowerCase();
    return modelsWithSize.filter(
      (model) =>
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query)
    );
  }, [modelsWithSize, searchQuery]);

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          marginBottom: 2
        }}
      >
        <TextField
          placeholder="Search models..."
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }
          }}
        />
        {showViewModeToggle && (
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            aria-label="view mode"
            size="small"
          >
            <ToggleButton value="grid" aria-label="grid view">
              <ViewModuleIcon />
            </ToggleButton>
            <ToggleButton value="list" aria-label="list view">
              <ViewListIcon />
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      {viewMode === "grid" ? (
        <Grid container spacing={3} className="recommended-models-grid">
          {filteredModels.map((model) => {
            return (
              <Grid item xs={12} sm={6} md={4} key={model.id}>
                <ModelCard
                  model={model}
                  onDownload={() => {
                    startDownload(
                      model.repo_id || "",
                      model.type || "",
                      model.path ?? null,
                      model.allow_patterns ?? null,
                      model.ignore_patterns ?? null
                    );
                  }}
                />
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <List>
          {filteredModels.map((model) => {
            return (
              <ModelListItem
                compactView={compactView}
                key={model.id}
                model={model}
                onDownload={() => {
                  startDownload(
                    model.repo_id || "",
                    model.type || "hf.model",
                    model.path ?? null,
                    model.allow_patterns ?? null,
                    model.ignore_patterns ?? null
                  );
                }}
              />
            );
          })}
        </List>
      )}
      <Typography
        variant="body1"
        sx={{ marginTop: "1em", color: ThemeNodes.palette.c_gray6 }}
      >
        <AnnouncementIcon
          fontSize="small"
          sx={{
            verticalAlign: "middle",
            marginRight: "0.5em",
            color: ThemeNodes.palette.c_warning
          }}
        />
        Models will be downloaded to your local cache folder in the standard
        location for Huggingface and Ollama.
      </Typography>
    </>
  );
};

export default RecommendedModels;
