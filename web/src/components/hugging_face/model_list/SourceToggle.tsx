import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleOption } from "../../ui_primitives";
import type { ModelSource } from "../../../stores/ModelManagerStore";

interface SourceToggleProps {
  source: ModelSource;
  onChange: (source: ModelSource) => void;
}

/**
 * Catalog source toggle for the ModelManager. "Get Started" is the guided,
 * hardware-aware onboarding; "Installed" lists models on disk (or the attached
 * worker); "Recommended" lists the curated catalog aggregated from installed
 * nodes; "Hub" searches the live HuggingFace Hub. The last three are browsable
 * for download.
 */
const SourceToggleInternal: React.FC<SourceToggleProps> = ({
  source,
  onChange
}) => {
  const { t } = useTranslation();
  const handleChange = useCallback(
    (_e: React.MouseEvent<HTMLElement>, value: ModelSource | null) => {
      if (value) {
        onChange(value);
      }
    },
    [onChange]
  );

  return (
    <ToggleGroup
      value={source}
      exclusive
      segmented
      onChange={handleChange}
      aria-label={t("i18n-next29.source.ariaLabel")}
    >
      <ToggleOption value="onboarding" aria-label={t("i18n-next29.source.getStarted")}>
        {t("i18n-next29.source.getStarted")}
      </ToggleOption>
      <ToggleOption value="installed" aria-label={t("i18n-next29.source.installed")}>
        {t("i18n-next29.source.installed")}
      </ToggleOption>
      <ToggleOption value="recommended" aria-label={t("i18n-next29.source.recommended")}>
        {t("i18n-next29.source.recommended")}
      </ToggleOption>
      <ToggleOption value="hub" aria-label={t("i18n-next29.source.hubAriaLabel")}>
        {t("i18n-next29.source.hub")}
      </ToggleOption>
    </ToggleGroup>
  );
};

export const SourceToggle = React.memo(SourceToggleInternal);
SourceToggle.displayName = "SourceToggle";
