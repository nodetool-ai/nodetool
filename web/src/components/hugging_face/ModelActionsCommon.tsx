import React from "react";
import { Tooltip, EditorButton } from "../ui_primitives";
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
    delay={TOOLTIP_ENTER_DELAY * 2}
    nextDelay={TOOLTIP_ENTER_NEXT_DELAY}
  >
    <span>
      <EditorButton
        className="show-in-explorer-button"
        density="compact"
        onClick={onClick}
        disabled={disabled}
        sx={{ minWidth: "auto", padding: "6px" }}
      >
        <FolderIcon />
      </EditorButton>
    </span>
  </Tooltip>
);

export const HuggingFaceLink: React.FC<{
  modelId: string;
}> = ({ modelId }) =>
  !modelId.endsWith("safetensors") && (
    <Tooltip
      title="View on HuggingFace"
      delay={TOOLTIP_ENTER_DELAY * 2}
      nextDelay={TOOLTIP_ENTER_NEXT_DELAY}
    >
      <EditorButton
        density="compact"
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
      </EditorButton>
    </Tooltip>
  );

export const OllamaLink: React.FC<{
  modelId: string;
}> = ({ modelId }) => {
  return (
    <Tooltip
      title="View on Ollama"
      delay={TOOLTIP_ENTER_DELAY * 2}
      nextDelay={TOOLTIP_ENTER_NEXT_DELAY}
    >
      <EditorButton
        density="compact"
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
            filter: "none"
          }}
        />
      </EditorButton>
    </Tooltip>
  );
};
