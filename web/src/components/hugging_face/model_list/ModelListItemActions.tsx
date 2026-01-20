import React, { memo } from "react";
import { Button, Tooltip, Chip, CircularProgress, Box } from "@mui/material";
import { Check } from "@mui/icons-material";
import DeleteButton from "../../buttons/DeleteButton";
import DownloadIcon from "@mui/icons-material/Download";

import {
  HuggingFaceLink,
  ModelShowInExplorerButton,
  OllamaLink
} from "../ModelActionsCommon";
import { UnifiedModel } from "../../../stores/ApiTypes";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../../config/constants";
import { isProduction } from "../../../stores/ApiClient";
import { isElectron } from "../../../utils/browser";

interface ModelListItemActionsProps {
  model: UnifiedModel;
  onDownload?: () => void;
  handleModelDelete?: (modelId: string) => void;
  handleShowInExplorer?: (modelId: string) => void;
  showFileExplorerButton?: boolean;
  isCheckingCache?: boolean;
}

export const ModelListItemActions: React.FC<ModelListItemActionsProps> = ({
  model,
  onDownload,
  handleModelDelete,
  handleShowInExplorer,
  showFileExplorerButton = true,
  isCheckingCache = false
}) => {
  const isHuggingFace = model.type?.startsWith("hf") ?? false;
  const isOllama = model.type === "llama_model";
  const downloaded = model.downloaded ?? false;
  const canShowExplorerButton = Boolean(
    handleShowInExplorer && showFileExplorerButton
  );
  const explorerButtonDisabled = !isOllama && !model.path;

  return (
    <div className="actions-container">
      {isCheckingCache && !downloaded && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5em",
            padding: "2px 8px",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: "divider",
            color: "text.secondary",
            fontSize: "0.75rem"
          }}
        >
          <CircularProgress size={12} thickness={5} />
          Checking cache...
        </Box>
      )}
      {onDownload && !downloaded && !isCheckingCache && (
        <Button
          className="model-download-button"
          onClick={onDownload}
          variant="outlined"
        >
          <DownloadIcon sx={{ marginRight: "0.5em", fontSize: "1.25em" }} />
          Download
        </Button>
      )}
      {downloaded && (
        <Tooltip
          title={
            handleShowInExplorer && !isProduction && isElectron
              ? "Show in Explorer"
              : "Downloaded"
          }
          enterDelay={TOOLTIP_ENTER_DELAY * 2}
          enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
        >
          <Chip
            label="Downloaded"
            color="success"
            variant="outlined"
            size="small"
            icon={<Check fontSize="small" />}
            sx={{
              fontWeight: 600,
              cursor: handleShowInExplorer ? "pointer" : "default"
            }}
            onClick={
              handleShowInExplorer
                ? () => handleShowInExplorer!(model.id)
                : undefined
            }
            clickable={!!handleShowInExplorer}
          />
        </Tooltip>
      )}

      <div className="model-actions">
        {canShowExplorerButton && !isProduction && isElectron && (
          <ModelShowInExplorerButton
            onClick={() => handleShowInExplorer!(model.id)}
            disabled={explorerButtonDisabled}
          />
        )}
        {handleModelDelete && (
          <DeleteButton
            onClick={() => handleModelDelete(model.id)}
            tooltip="Delete model"
          />
        )}
      </div>
      <div className="model-link">
        {isHuggingFace && (
          <HuggingFaceLink modelId={model.repo_id || model.id} />
        )}
        {isOllama && <OllamaLink modelId={model.id} />}
      </div>
    </div>
  );
};

export default memo(ModelListItemActions);
