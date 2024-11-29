import React, { useState, useMemo, useCallback, memo } from "react";
import { Button, Tooltip } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";
import RecommendedModelsDialog from "../hugging_face/RecommendedModelsDialog";
import { TOOLTIP_ENTER_DELAY } from "./BaseNode";
import { UnifiedModel } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { llama_models } from "../../config/models";
import useMetadataStore from "../../stores/MetadataStore";
import { isEqual } from "lodash";

interface ModelRecommendationsProps {
  nodeType: string;
}

const ModelRecommendations: React.FC<ModelRecommendationsProps> = ({
  nodeType
}) => {
  const [openModelDialog, setOpenModelDialog] = useState(false);
  const { startDownload, openDialog } = useModelDownloadStore();
  const getMetadata = useMetadataStore((state) => state.getMetadata);

  const recommendedModels: UnifiedModel[] = useMemo(() => {
    const nodeMetadata = getMetadata(nodeType);
    const node_namespace = nodeMetadata?.namespace || "";

    if (node_namespace.startsWith("ollama.")) {
      return llama_models.map((model) => ({
        id: model.id,
        name: model.name,
        type: "llama_model",
        repo_id: model.id
      }));
    } else {
      return (nodeMetadata?.recommended_models || []).map((model) => {
        const id = model.path
          ? `${model.repo_id}/${model.path}`
          : model.repo_id || "";
        return {
          id,
          repo_id: model.repo_id || "",
          name: model.repo_id || "",
          type: model.type || "hf.model",
          path: model.path ?? null,
          allow_patterns: model.allow_patterns ?? undefined,
          ignore_patterns: model.ignore_patterns ?? undefined
        };
      });
    }
  }, [getMetadata, nodeType]);

  const handleOpenModelDialog = useCallback(() => setOpenModelDialog(true), []);
  const handleCloseModelDialog = useCallback(
    () => setOpenModelDialog(false),
    []
  );

  if (recommendedModels.length === 0) {
    return null;
  }

  return (
    <>
      <Tooltip
        enterDelay={TOOLTIP_ENTER_DELAY}
        title="Find models to download."
      >
        <Button
          variant="outlined"
          className="model-button"
          sx={{
            fontSize: ThemeNodetool.fontSizeSmaller,
            color: ThemeNodetool.palette.c_gray5,
            margin: "0",
            lineHeight: "1.5em",
            borderRadius: "0",
            border: "none",
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "none",
              cursor: "pointer",
              color: ThemeNodetool.palette.c_white
            }
          }}
          onClick={handleOpenModelDialog}
        >
          Recommended models
        </Button>
      </Tooltip>

      <RecommendedModelsDialog
        open={openModelDialog}
        onClose={handleCloseModelDialog}
        recommendedModels={recommendedModels}
        startDownload={startDownload}
        openDialog={openDialog}
      />
    </>
  );
};

export default memo(ModelRecommendations, isEqual);
