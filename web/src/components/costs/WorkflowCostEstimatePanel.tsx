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
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Caption, CollapsibleSection, FlexRow, Label, SPACING, EYEBROW } from "../ui_primitives";
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
      ...EYEBROW,
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
  const { t } = useTranslation();
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
            <Label>{t("i18n-next71.workflowCostEstimatePanel.title")}</Label>
            <Caption>
              {summary?.hasItems
                ? t(
                    summary.unknownCount > 0
                      ? "i18n-next71.workflowCostEstimatePanel.compact.incomplete"
                      : "i18n-next71.workflowCostEstimatePanel.compact.perRun",
                    {
                      total: `${summary.isTotalLowerBound ? "≥ " : summary.isTotalApproximate ? "~" : ""}${summary.totalLabel}`
                    }
                  )
                : t("i18n-next71.workflowCostEstimatePanel.compact.perRunLabel")}
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
        <div className="cost-title">
          {t("i18n-next71.workflowCostEstimatePanel.title")}
        </div>
        <span className="cost-subtitle">
          {t("i18n-next71.workflowCostEstimatePanel.subtitle")}
        </span>
      </div>
      <CostEstimateSummary estimate={estimate} />
    </Box>
  );
};

export const WorkflowCostEstimatePanel = memo(
  WorkflowCostEstimatePanelInternal
);
export default WorkflowCostEstimatePanel;
