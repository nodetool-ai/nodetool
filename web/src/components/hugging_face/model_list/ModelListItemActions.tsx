import React from "react";
import { Button } from "@mui/material";
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
        {downloaded && <Check />}
        {handleShowInExplorer && showFileExplorerButton && (
          <ModelShowInExplorerButton
            onClick={() => handleShowInExplorer!(model.id)}
            disabled={isOllama ? !ollamaBasePath : !model.path}
          />
        )}
        {handleModelDelete && (
          <DeleteButton onClick={() => handleModelDelete(model.id)} />
        )}
      </div>
      <div className="model-actions">
        {isHuggingFace && (
          <HuggingFaceLink modelId={model.repo_id || model.id} />
        )}
        {isOllama && <OllamaLink modelId={model.id} />}
      </div>
    </div>
  );
};
