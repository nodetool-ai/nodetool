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
import { useTranslation } from "react-i18next";
import type { SxProps, Theme } from "@mui/material/styles";

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
  const { t, i18n } = useTranslation();
  const formatCost = (value: number): string =>
    new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
      style: "currency",
      currency: "USD",
      maximumSignificantDigits: 8
    }).format(value);
  const stepLabel = (label: string): string =>
    t(label === "Still"
      ? "screens4_15.storyboard.shotCost.still"
      : "screens4_15.storyboard.shotCost.clip");
  const stepReason = (reason: string | undefined): string => {
    if (reason?.startsWith("No still model picked")) {
      return t("screens4_15.storyboard.shotCost.noModel", {
        modelType: t("screens4_15.storyboard.shotCost.stillModel")
      });
    }
    if (reason?.startsWith("No clip model picked")) {
      return t("screens4_15.storyboard.shotCost.noModel", {
        modelType: t("screens4_15.storyboard.shotCost.clipModel")
      });
    }
    if (reason?.startsWith("No published price for ")) {
      return t("screens4_15.storyboard.shotCost.noPublishedPrice", {
        model: reason.slice("No published price for ".length).replace(/\.$/, "")
      });
    }
    return reason ?? "";
  };
  const listPrice = (
    <Caption color="secondary">
      {t("screens4_15.storyboard.shotCost.listPriceNote")}
    </Caption>
  );

  if (estimate.source === "stored") {
    return (
      <Tooltip
        placement="top"
        title={
          <Text size="small">
            {t("screens4_15.storyboard.shotCost.lastRenderTooltip")}
          </Text>
        }
      >
        <Caption color="muted" noWrap sx={sx}>
          {t("screens4_15.storyboard.shotCost.lastRender", {
            cost: formatCost(estimate.cost)
          })}
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
                  ? t("screens4_15.storyboard.shotCost.unpricedTooltip", {
                      step: stepLabel(step.label),
                      reason: stepReason(step.reason)
                    })
                  : t("screens4_15.storyboard.shotCost.pricedTooltip", {
                      step: stepLabel(step.label),
                      cost: step.breakdown ?? formatCost(step.cost)
                    })}
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
              ? t("screens4_15.storyboard.shotCost.unpriced", {
                  step: stepLabel(step.label)
                })
              : t("screens4_15.storyboard.shotCost.priced", {
                  step: stepLabel(step.label),
                  cost: formatCost(step.cost)
                })}
          </Caption>
        </Tooltip>
      ))}
      {pricedCount > 1 && (
        <Caption color="muted" noWrap>
          {t("screens4_15.storyboard.shotCost.total", {
            cost: formatCost(estimate.cost)
          })}
        </Caption>
      )}
    </FlexRow>
  );
};

export const ShotCostLine = memo(ShotCostLineInner);
ShotCostLine.displayName = "ShotCostLine";

export default ShotCostLine;
