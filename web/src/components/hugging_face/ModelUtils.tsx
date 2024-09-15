import React from "react";
import { UnifiedModel, CachedModel } from "../../stores/ApiTypes";
import { Box, Button, Tooltip, Typography } from "@mui/material";
import DeleteButton from "../buttons/DeleteButton";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { isProduction } from "../../stores/ApiClient";
import ModelIcon from "../../icons/model.svg";

// Add OllamaModel type
export type OllamaModel = {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
};

// Add prettifyModelType function
export const prettifyModelType = (type: string) => {
  if (type === "All") return type;

  if (type === "Ollama") {
    return (
      <>
        <img
          src="/ollama.png"
          alt="Ollama"
          style={{
            width: "16px",
            marginRight: "8px",
            filter: "invert(1)"
          }}
        />
        Ollama
      </>
    );
  }

  const parts = type.split(".");
  if (parts[0] === "hf") {
    parts.shift(); // Remove "hf"
    return (
      <>
        <img
          src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
          alt="Hugging Face"
          style={{ width: "20px", marginRight: "8px" }}
        />
        {parts
          .map((part) =>
            part
              .split("_")
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
              .join(" ")
          )
          .join(" ")}
      </>
    );
  }

  return (
    <>
      <img
        src={ModelIcon}
        alt="Model"
        style={{
          width: "20px",
          marginRight: "8px",
          filter: "invert(1)"
        }}
      />
      {type
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")}
    </>
  );
};

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

export const modelSize = (model: UnifiedModel) =>
  ((model.size_on_disk ?? 0) / 1024 / 1024).toFixed(2).toString() + " MB";

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

export const HuggingFaceLink: React.FC<{
  modelId: string;
}> = ({ modelId }) => (
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

export const renderModelSecondaryInfo = (
  modelData: any,
  isHuggingFace: boolean
) => (
  <>
    {isHuggingFace && (
      <Typography variant="body2">{modelData.cardData?.license}</Typography>
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
  <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
    {props.onDownload && !downloaded && (
      <ModelDownloadButton onClick={props.onDownload} />
    )}
    {downloaded && (
      <Tooltip title="Model downloaded">
        <CheckCircleIcon
          className="model-downloaded-icon"
          fontSize="small"
          color="success"
        />
      </Tooltip>
    )}
    {props.handleDelete && (
      <ModelDeleteButton onClick={() => props.handleDelete!(props.model.id)} />
    )}
  </Box>
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

export const groupModelsByType = (models: CachedModel[]) => {
  return models.reduce((acc, model) => {
    const type = model.model_type || "Other";
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(model);
    return acc;
  }, {} as Record<string, CachedModel[]>);
};

export const sortModelTypes = (types: string[]) => {
  return [
    "All",
    ...types.sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    })
  ];
};
