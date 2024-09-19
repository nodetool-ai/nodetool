/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Grid,
  Tooltip,
  IconButton,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  List
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ViewListIcon from "@mui/icons-material/ViewList";
import ViewModuleIcon from "@mui/icons-material/ViewModule";
import { RepoPath, UnifiedModel } from "../../stores/ApiTypes";
import { TOOLTIP_ENTER_DELAY } from "../node/BaseNode";
import ModelCard from "./ModelCard";
import ModelListItem from "./ModelListItem";
import { useQuery } from "@tanstack/react-query";
import { client } from "../../stores/ApiClient";

const styles = (theme: any) =>
  css({
    ".recommended-models-grid": {
      maxHeight: "650px",
      overflow: "auto",
      paddingRight: "1em"
    },
    ".model-download-button": {
      color: theme.palette.c_hl1
    }
  });

interface RecommendedModelsDialogProps {
  open: boolean;
  onClose: () => void;
  recommendedModels: UnifiedModel[];
  startDownload: (
    repoId: string,
    modelType: string,
    path: string | null,
    allowPatterns: string[] | null,
    ignorePatterns: string[] | null
  ) => void;
  openDialog: () => void;
}

const tryCacheFiles = async (files: RepoPath[]) => {
  const { data, error } = await client.POST(
    "/api/models/huggingface/try_cache_files",
    {
      body: files
    }
  );
  if (error) {
    throw new Error("Failed to check if file is cached: " + error);
  }
  return data;
};

const RecommendedModelsDialog: React.FC<RecommendedModelsDialogProps> = ({
  open,
  onClose,
  recommendedModels,
  startDownload,
  openDialog
}) => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

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
    <Dialog
      css={styles}
      className="recommended-models-dialog"
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle style={{ marginBottom: 2 }}>
        Recommended Models
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={handleViewModeChange}
          aria-label="view mode"
          sx={{ position: "absolute", right: 48, top: 8 }}
        >
          <ToggleButton value="grid" aria-label="grid view">
            <ViewModuleIcon />
          </ToggleButton>
          <ToggleButton value="list" aria-label="list view">
            <ViewListIcon />
          </ToggleButton>
        </ToggleButtonGroup>
        <Tooltip enterDelay={TOOLTIP_ENTER_DELAY} title="Close | ESC">
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500]
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ paddingBottom: "3em" }}>
        <>
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
                      openDialog();
                      onClose();
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
                  handleDelete={() => {}}
                  onDownload={() => {
                    startDownload(
                      model.repo_id || "",
                      model.type,
                      model.path ?? null,
                      model.allow_patterns ?? null,
                      model.ignore_patterns ?? null
                    );
                    openDialog();
                    onClose();
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
      </DialogContent>
    </Dialog>
  );
};

export default RecommendedModelsDialog;
