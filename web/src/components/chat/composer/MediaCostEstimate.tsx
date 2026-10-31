/**
 * The list price of the generation the composer is about to start.
 *
 * Reads as one muted figure next to the Generate button; everything that
 * produced it — the rung, the duration, the fan-out, and whatever the catalog
 * assumed — lives in the tooltip, so the row stays quiet until someone asks.
 * Renders nothing when no price can be reached (see {@link useMediaCostEstimate}).
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { Caption, FlexColumn, Text, Tooltip } from "../../ui_primitives";
import type { MediaMode } from "../../../stores/MediaGenerationStore";
import {
  useMediaCostEstimate,
  type MediaCostEstimateOptions
} from "./useMediaCostEstimate";

interface MediaCostEstimateProps extends MediaCostEstimateOptions {
  mode: MediaMode;
}

const MediaCostEstimateInternal: React.FC<MediaCostEstimateProps> = ({
  mode,
  requests,
  variations
}) => {
  const { t } = useTranslation();
  const estimate = useMediaCostEstimate(mode, { requests, variations });

  if (!estimate) {
    return null;
  }

  const perOutput =
    estimate.quantity > 1
      ? t("i18n-next18.chat.composer.mediaCost.outputsBreakdown", {
          count: estimate.quantity,
          breakdown: estimate.breakdown ?? t("i18n-next18.chat.composer.mediaCost.listPrice")
        })
      : estimate.breakdown;

  const detail = (
    <FlexColumn gap={0.5}>
      <Text size="small">{t("i18n-next18.chat.composer.mediaCost.estimatedCostTitle")}</Text>
      {perOutput && (
        <Caption color="secondary">{perOutput}</Caption>
      )}
      {estimate.assumptions?.map((line) => (
        <Caption key={line} color="secondary">
          {line}
        </Caption>
      ))}
      {estimate.warnings?.map((line) => (
        <Caption key={line} color="secondary">
          {line}
        </Caption>
      ))}
      <Caption color="secondary">
        {t("i18n-next18.chat.composer.mediaCost.billingNote")}
      </Caption>
    </FlexColumn>
  );

  return (
    <Tooltip title={detail} placement="top">
      <span
        className="media-cost-estimate"
        aria-label={t("i18n-next18.chat.composer.mediaCost.estimatedCostLabel", { amount: estimate.label })}
      >
        ≈&nbsp;{estimate.label}
      </span>
    </Tooltip>
  );
};

export const MediaCostEstimate = memo(MediaCostEstimateInternal);
export default MediaCostEstimate;
