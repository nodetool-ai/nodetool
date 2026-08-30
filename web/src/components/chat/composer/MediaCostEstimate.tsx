/**
 * The list price of the generation the composer is about to start.
 *
 * Reads as one muted figure next to the Generate button; everything that
 * produced it — the rung, the duration, the fan-out, and whatever the catalog
 * assumed — lives in the tooltip, so the row stays quiet until someone asks.
 * Renders nothing when no price can be reached (see {@link useMediaCostEstimate}).
 */

import React, { memo } from "react";
import { Caption, FlexColumn, Text, Tooltip } from "../../ui_primitives";
import type { MediaMode } from "../../../stores/MediaGenerationStore";
import { useMediaCostEstimate } from "./useMediaCostEstimate";

interface MediaCostEstimateProps {
  mode: MediaMode;
}

const MediaCostEstimateInternal: React.FC<MediaCostEstimateProps> = ({
  mode
}) => {
  const estimate = useMediaCostEstimate(mode);

  if (!estimate) {
    return null;
  }

  const perOutput =
    estimate.quantity > 1
      ? `${estimate.quantity} outputs × ${estimate.breakdown ?? "list price"}`
      : estimate.breakdown;

  const detail = (
    <FlexColumn gap={0.5}>
      <Text size="small">Estimated cost of this generation</Text>
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
        List price from the provider catalog. The run is billed by the provider
        at its own rates.
      </Caption>
    </FlexColumn>
  );

  return (
    <Tooltip title={detail} placement="top">
      <span
        className="media-cost-estimate"
        aria-label={`Estimated cost ${estimate.label}`}
      >
        ≈&nbsp;{estimate.label}
      </span>
    </Tooltip>
  );
};

export const MediaCostEstimate = memo(MediaCostEstimateInternal);
export default MediaCostEstimate;
