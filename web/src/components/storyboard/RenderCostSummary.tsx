/**
 * RenderCostSummary
 *
 * The estimate line under a render dialog's model picker: what the render is
 * about to spend, and why part of it could not be priced.
 */

import React from "react";
import { useTranslation } from "react-i18next";

import { Caption, FlexColumn, Text, SPACING } from "../ui_primitives";
import type { RenderBatchCostEstimate } from "../../hooks/storyboard/useRenderBatchCostEstimate";

export const RenderCostSummary: React.FC<{
  estimate: RenderBatchCostEstimate;
}> = ({ estimate }) => {
  const { t, i18n } = useTranslation();
  const formatUsd = (value: number): string =>
    new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 12
    }).format(value);
  const { requestCount, cost, pricedRequestCount, reasons, notes } = estimate;
  const priced = pricedRequestCount > 0 && cost > 0;
  return (
    <FlexColumn gap={SPACING.micro}>
      <Text size="small">
        {priced
          ? pricedRequestCount < requestCount
            ? t("screens4_14.storyboard.renderCost.estimatedPartial", {
                cost: formatUsd(cost),
                count: requestCount,
                pricedCount: new Intl.NumberFormat(i18n.language).format(pricedRequestCount),
                requestCount: new Intl.NumberFormat(i18n.language).format(requestCount)
              })
            : t("screens4_14.storyboard.renderCost.estimatedFull", {
                cost: formatUsd(cost)
              })
          : t("screens4_14.storyboard.renderCost.selectPricedModel")}
      </Text>
      {reasons.map((reason) => (
        <Caption key={reason} color="secondary">
          {reason.startsWith("No ") && reason.includes(" picked for this board.")
            ? t("screens4_14.storyboard.renderCost.noModelPicked", {
                modelKind: reason.slice(3, reason.indexOf(" picked for this board."))
              })
            : reason.startsWith("No published price for ")
              ? t("screens4_14.storyboard.renderCost.noPublishedPrice", {
                  model: reason.slice("No published price for ".length, -1)
                })
              : reason}
        </Caption>
      ))}
      {priced &&
        notes.map((note) => (
          <Caption key={note} color="secondary">
            {note.includes(": this model publishes no ") && note.endsWith(" price — shown at its base spec")
              ? t("screens4_14.storyboard.renderCost.basePriceNote", {
                  step: note.slice(0, note.indexOf(":")),
                  resolution: note.slice(
                    note.indexOf(": this model publishes no ") + ": this model publishes no ".length,
                    -" price — shown at its base spec".length
                  )
                })
              : note}
          </Caption>
        ))}
    </FlexColumn>
  );
};

export default RenderCostSummary;
