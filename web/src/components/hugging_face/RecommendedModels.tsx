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
import ThemeNodes from "../themes/ThemeNodes";

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
  const singleFileModels = recommendedModels.filter((model) => model.path);
  const filePaths = singleFileModels?.map((model) => ({
    repo_id: model.repo_id || "",
    path: model.path || ""
  }));
  const { data: fileInfos } = useQuery({
    queryKey: ["fileInfos"].concat(
      filePaths?.map((path) => path.repo_id + ":" + path.path)
    ),
    queryFn: async () => {
      const { data, error } = await client.POST(
        "/api/models/huggingface/file_info",
        {
          body: filePaths
        }
      );
      if (error) throw error;
      return data;
    },
    enabled: filePaths && filePaths.length > 0
  });

  const { data: downloadedSingleFileModels } = useQuery({
    queryKey: ["downloadedSingleFileModels"].concat(
      singleFileModels?.map((path) => path.repo_id + ":" + path.path)
    ),
    queryFn: async () => await tryCacheFiles(filePaths || []),
    enabled: filePaths && filePaths.length > 0
  });

  const modelsWithSize = useMemo(() => {
    const result = recommendedModels.map((model) => {
      const singleFileModel = model.path
        ? downloadedSingleFileModels?.find(
            (m) => m.repo_id === model.repo_id && m.path === model.path
          )
        : null;
      const singleFileModelSize = fileInfos?.find(
        (m) => m.repo_id === model.repo_id && m.path === model.path
      )?.size;
      const hfModel = hfModels?.find((m) => m.repo_id === model.repo_id);
      const modelWithSize = {
        ...model,
        size_on_disk: model.path ? singleFileModelSize : hfModel?.size_on_disk,
        downloaded: singleFileModel?.downloaded,
        readme: hfModel?.readme ?? ""
      };
      return modelWithSize;
    });
    return result;
  }, [recommendedModels, downloadedSingleFileModels, fileInfos, hfModels]);

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
                      model.type,
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
                    model.type,
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
        Models will be downloaded to your local cache folder in the standard
        location for Huggingface and Ollama.
      </Typography>
    </>
  );
};

export default RecommendedModels;
