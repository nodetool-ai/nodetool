import React, { memo, useCallback } from "react";
import Check from "@mui/icons-material/Check";
import {
  BORDER_RADIUS,
  Chip,
  CopyButton,
  DeleteButton,
  EditorButton,
  LoadingSpinner,
  Tooltip,
  Box,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
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
import { isProduction } from "../../../lib/env";
import { isElectron } from "../../../utils/browser";

interface ModelListItemActionsProps {
  model: UnifiedModel;
  onDownload?: () => void;
  onSelect?: () => void;
  handleModelDelete?: (modelId: string) => void;
  handleShowInExplorer?: (modelId: string) => void;
  showFileExplorerButton?: boolean;
  isCheckingCache?: boolean;
}

export const ModelListItemActions: React.FC<ModelListItemActionsProps> = ({
  model,
  onDownload,
  onSelect,
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

  const handleChipClick = useCallback(() => {
    if (handleShowInExplorer) {
      handleShowInExplorer(model.id);
    }
  }, [handleShowInExplorer, model.id]);

  const handleShowInExplorerClick = useCallback(() => {
    if (handleShowInExplorer) {
      handleShowInExplorer(model.id);
    }
  }, [handleShowInExplorer, model.id]);

  const handleDeleteClick = useCallback(() => {
    if (handleModelDelete) {
      handleModelDelete(model.id);
    }
  }, [handleModelDelete, model.id]);

  const handleSelectClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.();
    },
    [onSelect]
  );

  return (
    <div className="actions-container" onClick={(e) => e.stopPropagation()}>
      {isCheckingCache && !downloaded && (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5em",
            padding: `${getSpacingPx(SPACING.micro)} ${getSpacingPx(SPACING.md)}`,
            borderRadius: BORDER_RADIUS.pill,
            border: "1px solid",
            borderColor: "divider",
            color: "text.secondary",
            fontSize: "var(--fontSizeSmall)"
          }}
        >
          <LoadingSpinner inline size={12} thickness={5} color="inherit" />
          Checking cache…
        </Box>
      )}
      {onDownload && !downloaded && !isCheckingCache && (
        <EditorButton
          className="model-download-button"
          onClick={onDownload}
          variant="outlined"
          startIcon={<DownloadIcon sx={{ fontSize: "1.25em" }} />}
        >
          Download
        </EditorButton>
      )}
      {downloaded && onSelect && (
        <EditorButton
          className="model-select-button"
          onClick={handleSelectClick}
          variant="contained"
          startIcon={<Check sx={{ fontSize: "1.25em" }} />}
        >
          Use
        </EditorButton>
      )}
      {downloaded && !onSelect && (
        <Tooltip
          title={
            handleShowInExplorer && !isProduction && isElectron
              ? "Show in Explorer"
              : "Downloaded"
          }
          delay={TOOLTIP_ENTER_DELAY * 2}
          nextDelay={TOOLTIP_ENTER_NEXT_DELAY}
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
            onClick={handleShowInExplorer ? handleChipClick : undefined}
            clickable={!!handleShowInExplorer}
          />
        </Tooltip>
      )}

      <div className="model-actions">
        <CopyButton
          value={model.repo_id || model.id}
          tooltip={isOllama ? "Copy model name" : "Copy repo ID"}
          nodrag={false}
        />
        {canShowExplorerButton && !isProduction && isElectron && (
          <ModelShowInExplorerButton
            onClick={handleShowInExplorerClick}
            disabled={explorerButtonDisabled}
          />
        )}
        {handleModelDelete && (
          <DeleteButton
            onClick={handleDeleteClick}
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
