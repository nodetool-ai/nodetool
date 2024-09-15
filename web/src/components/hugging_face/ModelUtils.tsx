import React from "react";
import { UnifiedModel } from "../../stores/ApiTypes";
import { Button, Tooltip, Typography } from "@mui/material";
import DeleteButton from "../buttons/DeleteButton";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { isProduction } from "../../stores/ApiClient";

export interface ModelComponentProps {
  model: UnifiedModel;
  handleDelete?: (repoId: string) => void;
  onDownload?: () => void;
}

export function formatId(id: string) {
  if (id.includes("/")) {
    const [owner, repo] = id.split("/");
    return (
      <>
        <span className="repo">
          {repo}
          <br />
        </span>
        <span className="owner">{owner}/</span>
      </>
    );
  }
  return <span className="repo">{id}</span>;
}

export const modelSize = (model: any) =>
  (model.size_on_disk / 1024 / 1024).toFixed(2).toString() + " MB";

export const ModelDeleteButton: React.FC<{ onClick: () => void }> = ({
  onClick
}) => !isProduction && <DeleteButton onClick={onClick} />;

export const ModelDownloadButton: React.FC<{ onClick: () => void }> = ({
  onClick
}) => (
  <Button size="small" onClick={onClick}>
    Download
  </Button>
);

export const ModelExternalLink: React.FC<{
  isHuggingFace: boolean;
  modelId: string;
}> = ({ isHuggingFace, modelId }) => (
  <Tooltip title={`View on ${isHuggingFace ? "HuggingFace" : "Ollama"}`}>
    <Button
      size="small"
      href={
        isHuggingFace
          ? `https://huggingface.co/${modelId}`
          : `https://ollama.com/library/${modelId.split(":")[0]}`
      }
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        src={
          isHuggingFace
            ? "https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
            : "/ollama.png"
        }
        alt={isHuggingFace ? "Hugging Face" : "Ollama"}
        style={{ width: "1.5em", height: "auto" }}
      />
    </Button>
  </Tooltip>
);

export const renderModelSecondaryInfo = (
  modelData: any,
  isHuggingFace: boolean
) => (
  <>
    {isHuggingFace && (
      <Typography variant="body2">
        {modelData.cardData?.pipeline_tag} - {modelData.cardData?.license}
      </Typography>
    )}
    {!isHuggingFace && (
      <Typography variant="body2">
        {modelData.details?.parent_model} - {modelData.details?.format}
      </Typography>
    )}
  </>
);

export const renderModelActions = (
  props: ModelComponentProps,
  downloaded: boolean
) => (
  <>
    {props.handleDelete && (
      <ModelDeleteButton onClick={() => props.handleDelete!(props.model.id)} />
    )}
    {props.onDownload && !downloaded && (
      <ModelDownloadButton onClick={props.onDownload} />
    )}
    {downloaded && (
      <Tooltip title="Model downloaded">
        <CheckCircleIcon fontSize="small" color="success" />
      </Tooltip>
    )}
  </>
);

export async function fetchOllamaModelInfo(modelName: string) {
  const response = await fetch("http://localhost:11434/api/show", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: modelName })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  return data;
}
