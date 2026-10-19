/**
 * CostEstimateLine
 *
 * One muted figure for what the action next to it is about to spend — the
 * compact form of {@link CostEstimateSummary}, for inspectors and toolbars
 * where a four-column table does not fit. Everything behind the number lives
 * in the tooltip, so the row stays quiet until someone asks.
 *
 * Renders nothing when the caller has no figure: a surface that shows nothing
 * is better than one showing a number the run will not match.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { Caption, FlexColumn, Text, Tooltip } from "../ui_primitives";

/** A figure to show, plus what produced it. */
export interface CostLineDetail {
  /** The figure, already formatted: "$0.42". */
  label: string;
  /**
   * The figure leaves out a cost we know exists, so it reads "≥" rather than
   * "≈" — an unpriced clip in the total, a catalog surcharge it omits.
   */
  isLowerBound?: boolean;
  /** Breakdown, assumptions and warnings, one line each. */
  lines?: string[];
}

export interface CostEstimateLineProps {
  estimate: CostLineDetail | null;
  /** Tooltip heading, e.g. "Estimated cost of this generation". */
  title: string;
  /** Screen-reader prefix for the figure. Defaults to "Estimated cost". */
  ariaPrefix?: string;
}

const CostEstimateLineInternal: React.FC<CostEstimateLineProps> = ({
  estimate,
  title,
  ariaPrefix
}) => {
  const { t } = useTranslation();

  if (!estimate) {
    return null;
  }

  const resolvedAriaPrefix =
    ariaPrefix ?? t("i18n-next71.costEstimateLine.estimatedCost");
  const prefix = estimate.isLowerBound ? "≥" : "≈";
  const detail = (
    <FlexColumn gap={0.5}>
      <Text size="small">{title}</Text>
      {estimate.lines?.map((line) => (
        <Caption key={line} color="secondary">
          {line}
        </Caption>
      ))}
      <Caption color="secondary">
        {t("i18n-next71.costEstimateLine.providerCatalogNotice")}
      </Caption>
    </FlexColumn>
  );

  return (
    <Tooltip title={detail} placement="top">
      <Caption
        component="span"
        color="muted"
        className="cost-estimate-line"
        aria-label={`${resolvedAriaPrefix} ${estimate.label}`}
        sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
      >
        {prefix}&nbsp;{estimate.label}
      </Caption>
    </Tooltip>
  );
};

export const CostEstimateLine = memo(CostEstimateLineInternal);
export default CostEstimateLine;
