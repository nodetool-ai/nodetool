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
import { useQuery } from "@tanstack/react-query";
import { tryCacheFiles } from "../../serverState/tryCacheFiles";
import { client } from "../../stores/ApiClient";

interface RecommendedModelsProps {
  recommendedModels: UnifiedModel[];
  showViewModeToggle?: boolean;
  initialViewMode: "grid" | "list";
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
  showViewModeToggle = true
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">(initialViewMode);

  const { data: hfModels } = useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/huggingface_models",
        {}
      );
      if (error) throw error;
      return data;
    }
  });
  const loras = recommendedModels.filter((model) =>
    model.type.startsWith("hf.lora_sd")
  );
  const loraPaths = loras?.map((lora) => ({
    repo_id: lora.repo_id || "",
    path: lora.path || ""
  }));

  const { data: downloadedModels } = useQuery({
    queryKey: ["loraModels"].concat(
      loraPaths?.map((path) => path.repo_id + ":" + path.path)
    ),
    queryFn: async () => await tryCacheFiles(loraPaths || []),
    enabled: loraPaths && loraPaths.length > 0
  });

  const modelsWithSize = useMemo(() => {
    return recommendedModels.map((model) => {
      const hfModel = hfModels?.find((m) => m.repo_id === model.repo_id);
      const loraModel = downloadedModels?.find(
        (path) => path.repo_id === model.repo_id && path.path === model.path
      );
      return {
        ...model,
        size_on_disk: hfModel?.size_on_disk,
        downloaded: loraModel?.downloaded,
        readme: hfModel?.readme ?? ""
      };
    });
  }, [recommendedModels, hfModels, downloadedModels]);

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
          {modelsWithSize.map((model) => (
            <Grid item xs={12} sm={6} md={4} key={model.id}>
              <ModelCard
                model={model}
                onDownload={() => {
                  startDownload(
                    model.repo_id || "",
                    model.type,
                    model.path ?? null,
                    model.allow_patterns ?? null,
                    model.ignore_patterns ?? null
                  );
                  onModelSelect?.();
                }}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <List>
          {modelsWithSize.map((model) => (
            <ModelListItem
              key={model.id}
              model={model}
              onDownload={() => {
                startDownload(
                  model.repo_id || "",
                  model.type,
                  model.path ?? null,
                  model.allow_patterns ?? null,
                  model.ignore_patterns ?? null
                );
                onModelSelect?.();
              }}
            />
          ))}
        </List>
      )}
      <Typography variant="body1" sx={{ marginTop: "1em" }}>
        Models will be downloaded to your local cache folder in the standard
        location for Huggingface and Ollama.
      </Typography>
    </>
  );
};

export default RecommendedModels;
