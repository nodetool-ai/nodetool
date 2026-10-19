import { useModelProviderSetup } from "../../hooks/useModelProviderSetup";
import { useTranslation } from "react-i18next";
import React, { useState, useCallback, useMemo, useRef, memo } from "react";
import isEqual from "../../utils/isEqual";

import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  LoadingSpinner,
  FlexRow,
  MenuItemPrimitive,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useOllamaModels } from "../../hooks/useOllamaModels";
import type { LlamaModelValue } from "../../stores/ApiTypes";
import ModelSelectButton from "./shared/ModelSelectButton";
import { EditorMenu } from "../editor_ui";
import { isString } from "../../utils/typePredicates";

interface LlamaModelSelectProps {
  onChange: (value: LlamaModelValue) => void;
  value: string;
}

const LlamaModelSelect = ({ onChange, value }: LlamaModelSelectProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next40" });
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);

  const { ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError } =
    useOllamaModels();

  const sortedModels = useMemo(() => {
    if (!ollamaModels || ollamaLoading || ollamaIsFetching || ollamaError)
      {return [] as Array<{ name: string; repo_id: string }>;}

    return ollamaModels
      .map((m) => ({
        name: m.name,
        repo_id: m.repo_id ?? m.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!ollamaModels || !value) {return null;}
    return ollamaModels.find((m) => m.repo_id === value) ?? null;
  }, [ollamaModels, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const { openSetup } = useModelProviderSetup({
    open: !!anchorEl,
    onClose: handleClose,
    capability: "generate_message",
    providerIds: ["ollama"]
  });

  const handleModelSelect = useCallback(
    (repoId: string) => {
      onChange({
        type: "llama_model",
        repo_id: repoId
      });
      handleClose();
    },
    [onChange, handleClose]
  );

  const handleMenuItemClick = useCallback(
    (repoId: string) => () => {
      handleModelSelect(repoId);
    },
    [handleModelSelect]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || t("modelSelect.selectModel")}
        subLabel={t("modelSelect.selectModel")}
        onClick={handleClick}
      />
      <EditorMenu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        paperSx={{
          minWidth: 280,
          maxHeight: 400
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
      >
        {ollamaLoading ? (
          <FlexRow
            justify="center"
            sx={{ padding: 2 }}
          >
            <LoadingSpinner size="medium" />
          </FlexRow>
        ) : ollamaError ? (
          <div style={{ padding: getSpacingPx(SPACING.md), maxWidth: 300 }}>
            <ErrorBanner
              title={t("llama.loadErrorTitle")}
              report={{
                source: "operation-failure",
                summary: t("llama.loadErrorSummary"),
                errorText: isString((ollamaError as { detail?: unknown })?.detail)
                  ? (ollamaError as { detail?: string }).detail
                  : String(ollamaError)
              }}
            >
              {isString((ollamaError as { detail?: unknown })?.detail)
                ? (ollamaError as { detail?: string }).detail
                : t("llama.checkRunning")}
            </ErrorBanner>
            <Caption
              color="secondary"
              sx={{ display: "block", mt: 1 }}
            >
              {t("llama.separateApp")}
            </Caption>
            <Caption
              component="a"
              href="https://ollama.com/download"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ color: "primary.main", textDecoration: "underline" }}
            >
              {t("llama.download")}
            </Caption>
          </div>
        ) : sortedModels.length === 0 ? (
          <MenuItemPrimitive label={t("modelSelect.noModels")} disabled />
        ) : (
          sortedModels.map((model) => (
            <MenuItemPrimitive
              key={model.repo_id}
              label={model.name}
              onClick={handleMenuItemClick(model.repo_id)}
              selected={value === model.repo_id}
            />
          ))
        )}
        <MenuItemPrimitive label={t("modelSelect.addProviders")} dividerBefore onClick={openSetup} />
      </EditorMenu>
    </>
  );
};

export default memo(LlamaModelSelect, isEqual);
