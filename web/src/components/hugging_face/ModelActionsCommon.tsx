import React from "react";
import { Tooltip, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import FolderIcon from "@mui/icons-material/Folder";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";

export const ModelShowInExplorerButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
}> = ({ onClick, disabled }) => (
  <Tooltip
    title="Show in File Explorer"
    enterDelay={TOOLTIP_ENTER_DELAY * 2}
    enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
  >
    <span>
      <Button
        className="show-in-explorer-button"
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
    <Tooltip
      title="View on HuggingFace"
      enterDelay={TOOLTIP_ENTER_DELAY * 2}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
    >
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
}> = ({ modelId }) => {
  const theme = useTheme();
  return (
    <Tooltip
      title="View on Ollama"
      enterDelay={TOOLTIP_ENTER_DELAY * 2}
      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY}
    >
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
            filter: theme.vars.palette.mode === "light" ? "none" : "invert(1)"
          }}
        />
      </Button>
    </Tooltip>
  );
};
