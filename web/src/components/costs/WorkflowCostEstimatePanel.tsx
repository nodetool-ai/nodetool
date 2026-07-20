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
import { BORDER_RADIUS, Box, Caption } from "../ui_primitives";
import { useWorkflowCostEstimate } from "../../hooks/useWorkflowCostEstimate";
import { formatMoney } from "./costsData";

export interface WorkflowCostEstimatePanelProps {
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
    ".cost-row": {
      display: "grid",
      gridTemplateColumns: "1.6fr 1.6fr auto auto",
      gap: theme.spacing(1),
      alignItems: "center",
      padding: `${theme.spacing(1)} 0`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      "&:last-child": { borderBottom: "none" }
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
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      letterSpacing: "0.02em",
      color: theme.vars.palette.warning.main,
      padding: `1px ${theme.spacing(1)}`,
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.warning.main}`,
      whiteSpace: "nowrap"
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
      fontWeight: 700,
      color: theme.vars.palette.text.primary,
      fontVariantNumeric: "tabular-nums"
    },
    ".cost-note": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.warning.main
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
                Qty
              </span>
              <span className="cost-col-head" style={{ textAlign: "right" }}>
                Cost
              </span>
            </div>
            {estimate.items.map((item) => (
              <div className="cost-row" key={item.node_id}>
                <span className="cost-cell-node" title={item.node_type}>
                  {item.node_type}
                </span>
                {item.confidence === "unknown" ? (
                  <span className="cost-unknown">unknown price</span>
                ) : (
                  <span className="cost-cell-model">
                    {item.provider}
                    {item.model ? ` · ${item.model}` : ""}
                  </span>
                )}
                <span className="cost-cell-num">{item.quantity}</span>
                <span className="cost-cell-num">
                  {item.confidence === "unknown"
                    ? "—"
                    : formatMoney(item.estimated_cost)}
                </span>
              </div>
            ))}
          </div>

          <div className="cost-total">
            <span className="cost-total-key">Total ({estimate.currency})</span>
            <span className="cost-total-value">
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
        </>
      )}
    </Box>
  );
};

export const WorkflowCostEstimatePanel = memo(
  WorkflowCostEstimatePanelInternal
);
export default WorkflowCostEstimatePanel;
