/** @jsxImportSource @emotion/react */
/**
 * WorkflowCostEstimatePanel
 *
 * The plan-before-spend view for a workflow: a per-node estimate table for the
 * nodes that use an AI model (provider / model / quantity / cost, with
 * unknown-price nodes flagged) and the currency total. Styled to sit directly
 * under the Inspector in the right panel, so it mirrors the Inspector's
 * spacing, section headings, and row/divider treatment.
 *
 * The table itself is {@link CostEstimateSummary} — this component adds only
 * the section header and reads the live estimate for one open workflow.
 */

import { css } from "@emotion/react";
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Caption, CollapsibleSection, FlexRow, Label, SPACING } from "../ui_primitives";
import { useWorkflowCostEstimate } from "../../hooks/useWorkflowCostEstimate";
import { CostEstimateSummary } from "./CostEstimateSummary";
import { useCostEstimateSummary } from "./useCostEstimateSummary";

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
    }
  });

interface WorkflowCostEstimatePanelProps {
  workflowId: string;
  compact?: boolean;
}

const WorkflowCostEstimatePanelInternal: React.FC<
  WorkflowCostEstimatePanelProps
> = ({ workflowId, compact = false }) => {
  const theme = useTheme();
  const estimate = useWorkflowCostEstimate(workflowId);
  const summary = useCostEstimateSummary(estimate);

  if (compact) {
    return (
      <CollapsibleSection
        defaultOpen={false}
        unmountOnExit
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.stopPropagation();
          }
        }}
        title={
          <FlexRow gap={SPACING.md} justify="space-between" wrap>
            <Label>Cost estimate</Label>
            <Caption>
              {summary?.hasItems
                ? `${summary.isTotalLowerBound ? "≥ " : summary.isTotalApproximate ? "~" : ""}${summary.totalLabel}${summary.unknownCount > 0 ? " · incomplete" : " / run"}`
                : "Per run"}
            </Caption>
          </FlexRow>
        }
        sx={{
          px: SPACING.lg,
          py: SPACING.xs,
          "& > [role=button]": {
            minHeight: 28,
            "&:focus-visible": {
              outline: `2px solid ${theme.vars.palette.primary.main}`,
              outlineOffset: -2
            }
          }
        }}
      >
        <Box sx={{ py: SPACING.md }}>
          <CostEstimateSummary estimate={estimate} />
        </Box>
      </CollapsibleSection>
    );
  }

  return (
    <Box css={styles(theme)} className="cost-estimate">
      <div className="cost-head">
        <div className="cost-title">Cost estimate</div>
        <span className="cost-subtitle">Estimated cost of a single run</span>
      </div>
      <CostEstimateSummary estimate={estimate} />
    </Box>
  );
};

export const WorkflowCostEstimatePanel = memo(
  WorkflowCostEstimatePanelInternal
);
export default WorkflowCostEstimatePanel;
