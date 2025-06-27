import React from "react";
import { Button, Tooltip } from "@mui/material";
import { Check } from "@mui/icons-material";
import DeleteButton from "../../buttons/DeleteButton";
import DownloadIcon from "@mui/icons-material/Download";
import {
  HuggingFaceLink,
  ModelShowInExplorerButton,
  OllamaLink
} from "../ModelActionsCommon";
import { UnifiedModel } from "../../../stores/ApiTypes";
import { useModelInfo } from "../../../hooks/useModelInfo";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../../config/constants";

interface ModelListItemActionsProps {
  model: UnifiedModel;
  onDownload?: () => void;
  handleModelDelete?: (modelId: string) => void;
  handleShowInExplorer?: (modelId: string) => void;
  ollamaBasePath?: string | null;
  showFileExplorerButton?: boolean;
}

export const ModelListItemActions: React.FC<ModelListItemActionsProps> = ({
  model,
  onDownload,
  handleModelDelete,
  handleShowInExplorer,
  ollamaBasePath,
  showFileExplorerButton = true
}) => {
  const { isHuggingFace, isOllama } = useModelInfo(model);
  const downloaded = model.downloaded ?? !!model.path;

  return (
    <div className="actions-container">
      {onDownload && !downloaded && (
        <Button
          className="model-download-button"
          onClick={onDownload}
          variant="outlined"
        >
          <DownloadIcon sx={{ marginRight: "0.5em", fontSize: "1.25em" }} />
          Download
        </Button>
      )}

      <div className="model-actions">
        {downloaded && (
          <div className="downloaded-icon">
            <Tooltip
              title="Downloaded"
              enterDelay={TOOLTIP_ENTER_DELAY * 2}
              enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
            >
              <Check />
            </Tooltip>
          </div>
        )}
        {handleShowInExplorer && showFileExplorerButton && (
          <ModelShowInExplorerButton
            onClick={() => handleShowInExplorer!(model.id)}
            disabled={isOllama ? !ollamaBasePath : !model.path}
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
