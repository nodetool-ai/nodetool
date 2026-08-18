/** @jsxImportSource @emotion/react */
/**
 * WorkflowCostEstimatePanel
 *
 * The plan-before-spend view for a workflow: a per-node estimate table for the
 * nodes that use an AI model (provider / model / quantity / cost, with
 * unknown-price nodes flagged) and the currency total. Styled to sit directly
 * under the Inspector in the right panel, so it mirrors the Inspector's
 * spacing, section headings, and row/divider treatment.
 */

import { css } from "@emotion/react";
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import type { NodeCostEstimate } from "@nodetool-ai/protocol";
import { Box, Caption, ExternalLink, Tooltip } from "../ui_primitives";
import { genspendPricingCatalog } from "@nodetool-ai/model-pricing/genspend-catalog";
import { useWorkflowCostEstimate } from "../../hooks/useWorkflowCostEstimate";
import { formatMoney } from "./costsData";

/** Date the shipped GenSpend prices last moved, e.g. "2026-07-29". */
const genspendUpdatedOn = genspendPricingCatalog.updatedAt.slice(0, 10);
/** The upstream snapshot those prices were read from, when the catalog says. */
const genspendSnapshotOn =
  genspendPricingCatalog.catalogGeneratedAt?.slice(0, 10) ?? null;

/** True when the figure leaves out a cost we know exists — "at least $X". */
const isLowerBound = (item: NodeCostEstimate): boolean =>
  item.confidence !== "unknown" && (item.warnings?.length ?? 0) > 0;

/** A per-second row's duration, as the calculator wrote it ("5 s × $0.1/s"). */
const secondsFromBreakdown = (breakdown: string | undefined): string | null => {
  const match = breakdown ? /(\d+(?:\.\d+)?)\s*s\s*×/.exec(breakdown) : null;
  return match ? match[1] : null;
};

/** The rung a row was priced at ("… at 720p"), when the price is laddered. */
const resolutionFromBreakdown = (
  breakdown: string | undefined
): string | null => {
  const match = breakdown ? /\bat ([\d][\dA-Za-z×x]*)/.exec(breakdown) : null;
  return match ? match[1] : null;
};

/** "image" → "images" for a count that is not one. */
const plural = (unit: string, count: number): string =>
  count === 1 || unit.endsWith("s") ? unit : `${unit}s`;

/**
 * What a run of this node buys, in one phrase: fan-out, clip length and the
 * resolution rung it was priced at — "2 × 5 s @ 720p", "4 images". Falls back
 * to the bare count when the item carries nothing else.
 */
export function formatUnits(item: NodeCostEstimate): string {
  const quantity = item.quantity;
  const seconds = secondsFromBreakdown(item.breakdown);
  const resolution = resolutionFromBreakdown(item.breakdown);

  let units: string;
  if (seconds) {
    units = quantity === 1 ? `${seconds} s` : `${quantity} × ${seconds} s`;
  } else if (item.billing_unit && !/\bunits?\b/i.test(item.billing_unit)) {
    units = `${quantity} ${plural(item.billing_unit, quantity)}`;
  } else {
    units = String(quantity);
  }
  return resolution ? `${units} @ ${resolution}` : units;
}

interface WorkflowCostEstimatePanelProps {
  workflowId: string;
}

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(3),
    padding: theme.spacing(4),

    ".cost-head": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },
    ".cost-title": {
      fontFamily: theme.fontFamily1,
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary
    },
    ".cost-subtitle": {
      fontSize: theme.fontSizeSmall,
      color: theme.vars.palette.text.disabled
    },

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

const WorkflowCostEstimatePanelInternal: React.FC<
  WorkflowCostEstimatePanelProps
> = ({ workflowId }) => {
  const theme = useTheme();
  const estimate = useWorkflowCostEstimate(workflowId);

  return (
    <Box css={styles(theme)} className="cost-estimate">
      <div className="cost-head">
        <div className="cost-title">Cost estimate</div>
        <span className="cost-subtitle">Estimated cost of a single run</span>
      </div>

      {!estimate ? (
        <Caption size="smaller" color="muted">
          Open a workflow to see its cost estimate.
        </Caption>
      ) : estimate.items.length === 0 ? (
        <Caption size="smaller" color="muted">
          Add a node that uses an AI model to estimate a run&apos;s cost.
        </Caption>
      ) : (
        <>
          <div className="cost-table">
            <div className="cost-row is-head">
              <span className="cost-col-head">Node</span>
              <span className="cost-col-head">Provider / model</span>
              <span className="cost-col-head" style={{ textAlign: "right" }}>
                Units
              </span>
              <span className="cost-col-head" style={{ textAlign: "right" }}>
                Cost
              </span>
            </div>
            {estimate.items.map((item) => {
              const unknown = item.confidence === "unknown";
              // A declined price carries its reason in `assumptions`; that is
              // the actionable thing to say, not "unknown".
              const unknownReason =
                item.assumptions?.join(" ") ??
                "Price unknown — excluded from the total";
              const row = (
                <div className="cost-row">
                  <span className="cost-cell-node" title={item.node_type}>
                    {item.node_type}
                  </span>
                  {unknown ? (
                    <Tooltip title={unknownReason} arrow>
                      <span className="cost-unknown" aria-label="Price unknown">
                        <HelpOutlineIcon fontSize="inherit" />
                      </span>
                    </Tooltip>
                  ) : (
                    <span className="cost-cell-model">
                      {item.provider}
                      {item.model ? ` · ${item.model}` : ""}
                    </span>
                  )}
                  <span className="cost-cell-num">{formatUnits(item)}</span>
                  <span className="cost-cell-num">
                    {unknown
                      ? "—"
                      : `${isLowerBound(item) ? "≥ " : ""}${formatMoney(
                          item.estimated_cost
                        )}`}
                  </span>
                </div>
              );
              return (
                <div className="cost-item" key={item.node_id}>
                  {item.breakdown ? (
                    <Tooltip
                      title={[item.breakdown, ...(item.warnings ?? [])].join(
                        " — "
                      )}
                      arrow
                    >
                      {row}
                    </Tooltip>
                  ) : (
                    row
                  )}
                  {!unknown && item.assumptions?.length ? (
                    <span className="cost-assumption">
                      {item.assumptions.join(" · ")}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="cost-total">
            <span className="cost-total-key">Total ({estimate.currency})</span>
            <span className="cost-total-value">
              {estimate.items.some(isLowerBound) ? "≥ " : ""}
              {formatMoney(estimate.total)}
            </span>
          </div>
          {estimate.unknown_count > 0 && (
            <span className="cost-note">
              {estimate.unknown_count} node
              {estimate.unknown_count === 1 ? "" : "s"} without a known price
              {estimate.unknown_count === 1 ? " is" : " are"} excluded from the
              total.
            </span>
          )}
          <Tooltip
            title={
              genspendSnapshotOn
                ? `Prices read from the genspend.io catalog snapshot of ${genspendSnapshotOn}`
                : "Prices ship with the app; a nightly sync moves them"
            }
            arrow
          >
            <span className="cost-credit">
              List prices from provider catalogs and{" "}
              <ExternalLink href="https://genspend.io" size="small">
                genspend.io
              </ExternalLink>
              , last updated {genspendUpdatedOn}.
            </span>
          </Tooltip>
        </>
      )}
    </Box>
  );
};

export const WorkflowCostEstimatePanel = memo(
  WorkflowCostEstimatePanelInternal
);
export default WorkflowCostEstimatePanel;
