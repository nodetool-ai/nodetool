/**
 * ShotCostLine
 *
 * What rendering this shot costs, one figure per step: the still and the clip
 * are priced by different models and only the clip's moves with the shot's
 * length, so a single total hides which number a change affected.
 *
 * A step nothing prices shows a dash and says why in its tooltip — the board
 * has no model picked for it, or no catalog carries the one it has. Leaving it
 * out instead is what makes a missing clip cost look broken.
 */

import React, { memo } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  Caption,
  FlexColumn,
  FlexRow,
  Text,
  Tooltip,
  SPACING
} from "../ui_primitives";
import type { ShotCostEstimate } from "../../hooks/storyboard/useShotCostEstimate";

interface ShotCostLineProps {
  estimate: ShotCostEstimate;
  sx?: SxProps<Theme>;
}

const ShotCostLineInner: React.FC<ShotCostLineProps> = ({ estimate, sx }) => {
  const listPrice = (
    <Caption color="secondary">
      List price from the provider catalog. The render is billed by the provider
      at its own rates.
    </Caption>
  );

  if (estimate.source === "stored") {
    return (
      <Tooltip
        placement="top"
        title={
          <Text size="small">
            What the last render of this shot cost. Pick the board&apos;s still
            and clip models to estimate the next one.
          </Text>
        }
      >
        <Caption color="muted" noWrap sx={sx}>
          {`last render ${formatUsd(estimate.cost)}`}
        </Caption>
      </Tooltip>
    );
  }

  if (estimate.steps.length === 0) {
    return null;
  }

  const pricedCount = estimate.steps.filter(
    (step) => step.cost !== null
  ).length;

  return (
    <FlexRow align="center" gap={SPACING.sm} wrap sx={sx}>
      {estimate.steps.map((step) => (
        <Tooltip
          key={step.label}
          placement="top"
          title={
            <FlexColumn gap={SPACING.micro}>
              <Text size="small">
                {step.cost === null
                  ? `${step.label}: ${step.reason}`
                  : `${step.label}: ${step.breakdown ?? formatUsd(step.cost)}`}
              </Text>
              {step.cost !== null && (
                <>
                  {estimate.notes.map((note) => (
                    <Caption key={note} color="secondary">
                      {note}
                    </Caption>
                  ))}
                  {listPrice}
                </>
              )}
            </FlexColumn>
          }
        >
          <Caption color={step.cost === null ? "muted" : "secondary"} noWrap>
            {step.cost === null
              ? `${step.label} —`
              : `${step.label} ~${formatUsd(step.cost)}`}
          </Caption>
        </Tooltip>
      ))}
      {pricedCount > 1 && (
        <Caption color="muted" noWrap>
          {`total ~${formatUsd(estimate.cost)}`}
        </Caption>
      )}
    </FlexRow>
  );
};

export const ShotCostLine = memo(ShotCostLineInner);
ShotCostLine.displayName = "ShotCostLine";

export default ShotCostLine;
