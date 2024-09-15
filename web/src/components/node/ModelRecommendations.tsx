import React, { useState, useMemo, useCallback } from "react";
import { Button, Tooltip } from "@mui/material";
import ThemeNodetool from "../themes/ThemeNodetool";
import RecommendedModelsDialog from "../hugging_face/RecommendedModelsDialog";
import { TOOLTIP_ENTER_DELAY } from "./BaseNode";
import { UnifiedModel } from "../../stores/ApiTypes";
import { useModelDownloadStore } from "../../stores/ModelDownloadStore";
import { useMetadata } from "../../serverState/useMetadata";
import { llama_models } from "../../config/models";

interface ModelRecommendationsProps {
  nodeType: string;
}

const ModelRecommendations: React.FC<ModelRecommendationsProps> = React.memo(
  ({ nodeType }) => {
    const [openModelDialog, setOpenModelDialog] = useState(false);
    const { startDownload, openDialog } = useModelDownloadStore();
    const { data: metadata } = useMetadata();

    const recommendedModels: UnifiedModel[] = useMemo(() => {
      if (!metadata) return [];

      const nodeMetadata = metadata.metadataByType[nodeType];
      const node_namespace = nodeMetadata?.namespace || "";

      if (node_namespace.startsWith("huggingface.")) {
        return (nodeMetadata?.recommended_models || []).map((model) => ({
          id: model.repo_id || "",
          name: model.repo_id || "",
          type: model.type || "hf.model",
          path: model.path ?? null,
          allow_patterns: model.allow_patterns ?? undefined,
          ignore_patterns: model.ignore_patterns ?? undefined
        }));
      } else if (node_namespace.startsWith("ollama.")) {
        return llama_models;
      }
      return [];
    }, [metadata, nodeType]);

    const handleOpenModelDialog = useCallback(
      () => setOpenModelDialog(true),
      []
    );
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
            variant="text"
            className="model-button"
            size="small"
            sx={{
              fontSize: ThemeNodetool.fontSizeTiny,
              color: ThemeNodetool.palette.c_gray5,
              margin: "0",
              lineHeight: "1em",
              borderRadius: "0"
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
  }
);

ModelRecommendations.displayName = "ModelRecommendations";

export default ModelRecommendations;
