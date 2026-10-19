/** @jsxImportSource @emotion/react */
/**
 * CostEstimateSummary
 *
 * The plan-before-spend table: one row per AI-model node (provider / model /
 * units / cost, unknown-price nodes flagged), an honestly-labeled total, and
 * the price-source credit. Pure presentation over
 * {@link useCostEstimateSummary} — any surface that wants a cost estimate
 * mounts this instead of the editor's `WorkflowCostEstimatePanel`, which adds
 * only the section header around it.
 */

import { css } from "@emotion/react";
import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import type { WorkflowCostEstimateDetail } from "@nodetool-ai/node-sdk/cost-estimate";
import { Box, Caption, ExternalLink, Tooltip } from "../ui_primitives";
import { genspendPricingCatalog } from "@nodetool-ai/model-pricing/genspend-catalog";
import { useCostEstimateSummary } from "./useCostEstimateSummary";

/** Date the shipped GenSpend prices last moved, e.g. "2026-07-29". */
const genspendUpdatedOn = genspendPricingCatalog.updatedAt.slice(0, 10);
/** The upstream snapshot those prices were read from, when the catalog says. */
const genspendSnapshotOn =
  genspendPricingCatalog.catalogGeneratedAt?.slice(0, 10) ?? null;

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(3),

    ".cost-table": {
      display: "flex",
      flexDirection: "column"
    },
    ".cost-item": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": { borderBottom: "none" }
    },
    ".cost-row": {
      display: "grid",
      gridTemplateColumns: "1.6fr 1.6fr auto auto",
      gap: theme.spacing(1),
      alignItems: "center",
      padding: `${theme.spacing(1)} 0`
    },
    ".cost-row.is-head": {
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".cost-col-head": {
      fontFamily: theme.fontFamily1,
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary
    },
    ".cost-cell-node": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0
    },
    ".cost-cell-model": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      letterSpacing: "0.02em",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0
    },
    ".cost-cell-num": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      textAlign: "right",
      fontVariantNumeric: "tabular-nums",
      color: theme.vars.palette.text.primary
    },
    ".cost-unknown": {
      justifySelf: "start",
      display: "inline-flex",
      alignItems: "center",
      color: theme.vars.palette.warning.main,
      fontSize: theme.fontSizeNormal,
      cursor: "help"
    },

    ".cost-total": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: theme.spacing(2),
      paddingTop: theme.spacing(1),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".cost-total-key": {
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".cost-total-value": {
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeNormal,
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      fontVariantNumeric: "tabular-nums"
    },
    ".cost-assumption": {
      display: "block",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      paddingBottom: theme.spacing(1)
    },
    ".cost-note": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.warning.main
    },
    ".cost-credit": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    }
  });

export interface CostEstimateSummaryProps {
  estimate: WorkflowCostEstimateDetail | null;
  /** Shown when `estimate` is null — the caller has no graph to estimate yet. */
  unavailableMessage?: string;
  /** Shown when the graph has no AI-model nodes to price. */
  emptyMessage?: string;
  /** Hide the "prices from provider catalogs / genspend.io" footnote. */
  showPriceCredit?: boolean;
}

const CostEstimateSummaryInternal: React.FC<CostEstimateSummaryProps> = ({
  estimate,
  unavailableMessage,
  emptyMessage,
  showPriceCredit = true
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const summary = useCostEstimateSummary(estimate);

  if (!summary) {
    return (
      <Caption size="smaller" color="muted">
        {unavailableMessage ??
          t("i18n-next71.costEstimateSummary.unavailable")}
      </Caption>
    );
  }
  if (!summary.hasItems) {
    return (
      <Caption size="smaller" color="muted">
        {emptyMessage ?? t("i18n-next71.costEstimateSummary.empty")}
      </Caption>
    );
  }

  return (
    <Box css={styles(theme)} className="cost-estimate-summary">
      <div className="cost-table">
        <div className="cost-row is-head">
          <span className="cost-col-head">
            {t("i18n-next71.costEstimateSummary.node")}
          </span>
          <span className="cost-col-head">
            {t("i18n-next71.costEstimateSummary.providerModel")}
          </span>
          <span className="cost-col-head" style={{ textAlign: "right" }}>
            {t("i18n-next71.costEstimateSummary.units")}
          </span>
          <span className="cost-col-head" style={{ textAlign: "right" }}>
            {t("i18n-next71.costEstimateSummary.cost")}
          </span>
        </div>
        {summary.rows.map((row) => {
          const rowEl = (
            <div className="cost-row">
              <span className="cost-cell-node" title={row.nodeType}>
                {row.nodeTitle}
              </span>
              {row.unknown ? (
                <Tooltip title={row.unknownReason}>
                  <span
                    className="cost-unknown"
                    aria-label={t(
                      "i18n-next71.costEstimateSummary.priceUnknown"
                    )}
                  >
                    <HelpOutlineIcon fontSize="inherit" />
                  </span>
                </Tooltip>
              ) : (
                <span className="cost-cell-model">{row.providerModel}</span>
              )}
              <span className="cost-cell-num">{row.units}</span>
              <span className="cost-cell-num">
                {row.unknown
                  ? "—"
                  : `${row.isLowerBound ? "≥ " : row.isApproximate ? "~" : ""}${row.costLabel}`}
              </span>
            </div>
          );
          return (
            <div className="cost-item" key={row.key}>
              {row.tooltip ? (
                <Tooltip title={row.tooltip}>
                  {rowEl}
                </Tooltip>
              ) : (
                rowEl
              )}
              {row.assumptions.length > 0 ? (
                <span className="cost-assumption">
                  {row.assumptions.join(" · ")}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="cost-total">
        <span className="cost-total-key">
          {t("i18n-next71.costEstimateSummary.total", {
            currency: summary.currency
          })}
        </span>
        <span className="cost-total-value">
          {summary.isTotalLowerBound
            ? "≥ "
            : summary.isTotalApproximate
              ? "~"
              : ""}
          {summary.totalLabel}
        </span>
      </div>
      {summary.unknownCount > 0 && (
        <span className="cost-note">
          {t("i18n-next71.costEstimateSummary.unknownExcluded", {
            count: summary.unknownCount
          })}
        </span>
      )}
      {showPriceCredit && (
        <Tooltip
          title={
            genspendSnapshotOn
              ? t("i18n-next71.costEstimateSummary.snapshotTooltip", {
                  date: genspendSnapshotOn
                })
              : t("i18n-next71.costEstimateSummary.catalogTooltip")
          }
        >
          <span className="cost-credit">
            {t("i18n-next71.costEstimateSummary.priceCreditPrefix")} {" "}
            <ExternalLink href="https://genspend.io" size="small">
              genspend.io
            </ExternalLink>
            {t("i18n-next71.costEstimateSummary.priceCreditSuffix", {
              date: genspendUpdatedOn
            })}
          </span>
        </Tooltip>
      )}
    </Box>
  );
};

export const CostEstimateSummary = memo(CostEstimateSummaryInternal);
export default CostEstimateSummary;
