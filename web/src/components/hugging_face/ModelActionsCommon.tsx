import React from "react";
import { Tooltip, Button } from "@mui/material";
import FolderIcon from "@mui/icons-material/Folder";

export const ModelShowInExplorerButton: React.FC<{
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
