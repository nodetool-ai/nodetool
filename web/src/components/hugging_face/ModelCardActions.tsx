import React from "react";
import { CardActions, Box, Typography, Tooltip, Button } from "@mui/material";
import CloudDownloadIcon from "@mui/icons-material/CloudDownload";
import FavoriteIcon from "@mui/icons-material/Favorite";
import DeleteButton from "../buttons/DeleteButton";
import { Check } from "@mui/icons-material";
import { isProduction } from "../../stores/ApiClient";
import DownloadIcon from "@mui/icons-material/Download";
import FolderIcon from "@mui/icons-material/Folder";
import ThemeNodetool from "../themes/ThemeNodetool";
import { UnifiedModel } from "../../stores/ApiTypes";
import { ModelComponentProps } from "./ModelUtils";

const ModelDeleteButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <>{!isProduction && <DeleteButton onClick={onClick} />}</>
);

const ModelShowInExplorerButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
}> = ({ onClick, disabled }) => (
  <Tooltip title="Show in File Explorer">
    <span>
      <Button
        onClick={onClick}
        disabled={disabled}
        sx={{ minWidth: "auto", padding: "6px" }}
      >
        <FolderIcon />
      </Button>
    </span>
  </Tooltip>
);

const ModelDownloadButton: React.FC<{ onClick: () => void }> = ({
  onClick
}) => (
  <Button
    className="model-download-button"
    onClick={onClick}
    variant="outlined"
  >
    <DownloadIcon sx={{ marginRight: "0.5em", fontSize: "1.25em" }} />
    Download
  </Button>
);

export const HuggingFaceLink: React.FC<{
  modelId: string;
}> = ({ modelId }) =>
  !modelId.endsWith("safetensors") && (
    <Tooltip title="View on HuggingFace">
      <Button
        size="small"
        href={`https://huggingface.co/${modelId}`}
        className="model-external-link-icon huggingface-link"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
          alt="Hugging Face"
          style={{
            width: "1.5em",
            height: "auto"
          }}
        />
      </Button>
    </Tooltip>
  );

export const OllamaLink: React.FC<{
  modelId: string;
}> = ({ modelId }) => (
  <Tooltip title="View on Ollama">
    <Button
      size="small"
      href={`https://ollama.com/library/${modelId.split(":")[0]}`}
      className="model-external-link-icon ollama-link"
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        src="/ollama.png"
        alt="Ollama"
        style={{
          width: "1.25em",
          height: "auto",
          filter: "invert(1)"
        }}
      />
    </Button>
  </Tooltip>
);

const ModelActions: React.FC<
  ModelComponentProps & {
    downloaded: boolean;
    showFileExplorerButton?: boolean;
  }
> = (props) => {
  const {
    model,
    handleModelDelete,
    handleShowInExplorer,
    onDownload,
    downloaded,
    showFileExplorerButton = true
  } = props;

  return (
    <Box
      className="model-actions"
      sx={{
        display: "flex",
        gap: 1,
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        padding: "0 .5em"
      }}
    >
      {onDownload && !downloaded && (
        <ModelDownloadButton onClick={onDownload} />
      )}
      {downloaded && (
        <Tooltip title="Downloaded">
          <Check sx={{ marginRight: "0.1em", fontSize: "1.25em" }} />
        </Tooltip>
      )}
      {handleShowInExplorer && showFileExplorerButton && (
        <ModelShowInExplorerButton
          onClick={() => handleShowInExplorer!(model.id)}
          disabled={!model.path}
        />
      )}
      {handleModelDelete && (
        <ModelDeleteButton onClick={() => handleModelDelete!(model.id)} />
      )}
    </Box>
  );
};

interface ModelCardActionsProps {
  model: UnifiedModel;
  modelData: any;
  isHuggingFace: boolean;
  isOllama: boolean;
  handleModelDelete?: (modelId: string) => void;
  handleShowInExplorer?: (modelId: string) => void;
  onDownload?: () => void;
  downloaded: boolean;
  showFileExplorerButton?: boolean;
  ollamaBasePath?: string | null;
}

const ModelCardActions: React.FC<ModelCardActionsProps> = ({
  model,
  modelData,
  isHuggingFace,
  isOllama,
  handleModelDelete,
  handleShowInExplorer,
  onDownload,
  downloaded,
  showFileExplorerButton,
  ollamaBasePath
}) => {
  const showFileExplorerButtonFinal =
    showFileExplorerButton !== undefined
      ? showFileExplorerButton
      : model.type === "llama_model"
      ? !model.path && !ollamaBasePath
      : !model.path;

  return (
    <>
      <ModelActions
        model={model}
        handleModelDelete={handleModelDelete}
        onDownload={onDownload}
        handleShowInExplorer={handleShowInExplorer}
        showFileExplorerButton={showFileExplorerButtonFinal}
        downloaded={downloaded}
      />
      <CardActions
        className="card-actions"
        sx={{ justifyContent: "space-between", p: 2 }}
      >
        {isHuggingFace && (
          <Box className="model-stats">
            <Typography
              variant="body2"
              color="text.secondary"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5
              }}
            >
              <Tooltip title="Downloads on HF last month">
                <CloudDownloadIcon
                  fontSize="small"
                  sx={{
                    color: ThemeNodetool.palette.c_gray3,
                    marginRight: ".1em"
                  }}
                />
              </Tooltip>
              <Typography variant="body2" component="span">
                {modelData?.downloads?.toLocaleString() || "N/A"}
              </Typography>

              <Tooltip title="Likes on HF">
                <FavoriteIcon
                  fontSize="small"
                  sx={{ ml: 2, color: ThemeNodetool.palette.c_gray3 }}
                />
              </Tooltip>
              {modelData?.likes?.toLocaleString() || "N/A"}
            </Typography>
          </Box>
        )}
        {isHuggingFace && <HuggingFaceLink modelId={model.id} />}
        {isOllama && <OllamaLink modelId={model.id} />}
      </CardActions>
    </>
  );
};

export default React.memo(ModelCardActions);

export { ModelActions };
