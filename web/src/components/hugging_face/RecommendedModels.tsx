import React, { useMemo, useState } from "react";
import {
  Grid,
  List,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { UnifiedModel } from "../../stores/ApiTypes";
import ModelCard from "./ModelCard";
import ModelListItem from "./ModelListItem";
import ThemeNodes from "../themes/ThemeNodes";
import AnnouncementIcon from "@mui/icons-material/Announcement";
import { useModelsWithSize } from "../../hooks/useModelsWithSize";

interface RecommendedModelsProps {
  recommendedModels: UnifiedModel[];
  showViewModeToggle?: boolean;
  initialViewMode: "grid" | "list";
  compactView?: boolean;
  startDownload: (
    repoId: string,
    modelType: string,
    path: string | null,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => void;
  onModelSelect?: () => void;
}

const RecommendedModels: React.FC<RecommendedModelsProps> = ({
  recommendedModels,
  initialViewMode,
  startDownload,
  onModelSelect,
  showViewModeToggle = true,
  compactView = false
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);
  const modelsWithSize = useModelsWithSize(recommendedModels);

  const handleViewModeChange = (
    event: React.MouseEvent<HTMLElement>,
    newViewMode: "grid" | "list" | null
  ) => {
    if (newViewMode !== null) {
      setViewMode(newViewMode);
    }
  };

  return (
    <>
      {showViewModeToggle && (
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          aria-label="view mode"
          sx={{ marginBottom: 2 }}
        >
          <ToggleButton value="grid" aria-label="grid view">
            <ViewModuleIcon />
          </ToggleButton>
          <ToggleButton value="list" aria-label="list view">
            <ViewListIcon />
          </ToggleButton>
        </ToggleButtonGroup>
      )}

      {viewMode === "grid" ? (
        <Grid container spacing={3} className="recommended-models-grid">
          {modelsWithSize.map((model) => {
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
                    onModelSelect?.();
                  }}
                />
              </Grid>
            );
          })}
        </Grid>
      ) : (
        <List>
          {modelsWithSize.map((model) => {
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
                  onModelSelect?.();
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
