import React from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, EditorButton, SPACING, getSpacingPx } from "../ui_primitives";
import FolderIcon from "@mui/icons-material/FolderOutlined";
import { TOOLTIP_DESCRIPTION_DELAY } from "../../config/constants";

export const ModelShowInExplorerButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
}> = ({ onClick, disabled }) => {
  const { t } = useTranslation();
  return (
    <Tooltip
      title={t("screen_models.huggingFace.showInFileExplorer")}
      delay={TOOLTIP_DESCRIPTION_DELAY}
    >
      <span>
        <EditorButton
          className="show-in-explorer-button"
          density="compact"
          onClick={onClick}
          disabled={disabled}
          sx={{ minWidth: "auto", padding: getSpacingPx(SPACING.sm) }}
        >
          <FolderIcon />
        </EditorButton>
      </span>
    </Tooltip>
  );
};

export const HuggingFaceLink: React.FC<{
  modelId: string;
}> = ({ modelId }) => {
  const { t } = useTranslation();
  return (
    !modelId.endsWith("safetensors") && (
      <Tooltip
        title={t("screen_models.huggingFace.viewOnHuggingFace")}
        delay={TOOLTIP_DESCRIPTION_DELAY}
      >
        <EditorButton
          density="compact"
          href={`https://huggingface.co/${modelId}`}
          className="model-external-link-icon huggingface-link"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <img
            src="https://huggingface.co/front/assets/huggingface_logo-noborder.svg"
            alt={t("screen_models.huggingFace.huggingFaceLogoAlt")}
            style={{
              width: "1.25em",
              height: "auto"
            }}
          />
        </EditorButton>
      </Tooltip>
    )
  );
};

export const OllamaLink: React.FC<{
  modelId: string;
}> = ({ modelId }) => {
  const { t } = useTranslation();
  return (
    <Tooltip
      title={t("screen_models.huggingFace.viewOnOllama")}
      delay={TOOLTIP_DESCRIPTION_DELAY}
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
          alt={t("screen_models.huggingFace.ollamaLogoAlt")}
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
