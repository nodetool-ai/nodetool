/**
 * WorkflowCostEstimatePanel
 *
 * The full plan-before-spend view for a workflow: a per-node estimate table
 * (provider / model / quantity / cost, with unknown-price nodes flagged), the
 * currency total, a budget-cap input, a draft-mode toggle, and a warning banner
 * when the estimate would break the budget.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import type { DraftMode } from "@nodetool-ai/protocol";
import { withinBudget } from "@nodetool-ai/node-sdk";
import {
  Panel,
  Card,
  Text,
  Label,
  Caption,
  Chip,
  TextInput,
  ToggleGroup,
  ToggleOption,
  AlertBanner,
  Divider,
  FlexRow,
  FlexColumn,
  EmptyState,
  SPACING
} from "../ui_primitives";
import { useWorkflowCostEstimate } from "../../hooks/useWorkflowCostEstimate";
import { useBudgetStore, selectBudget } from "../../stores/BudgetStore";
import { formatMoney } from "./costsData";

export interface WorkflowCostEstimatePanelProps {
  workflowId: string;
}

const DRAFT_MODES: DraftMode[] = ["off", "draft", "final"];

const WorkflowCostEstimatePanelInternal: React.FC<
  WorkflowCostEstimatePanelProps
> = ({ workflowId }) => {
  const theme = useTheme();
  const estimate = useWorkflowCostEstimate(workflowId);
  const budget = useBudgetStore(useShallow(selectBudget));
  const draftMode = useBudgetStore((s) => s.draftMode);
  const setCap = useBudgetStore((s) => s.setCap);
  const setDraftMode = useBudgetStore((s) => s.setDraftMode);

  const over = useMemo(
    () => (estimate ? !withinBudget(estimate, budget) : false),
    [estimate, budget]
  );

  const handleCapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      setCap(Number.isFinite(next) ? next : 0);
    },
    [setCap]
  );

  const handleDraftModeChange = useCallback(
    (_e: React.MouseEvent<HTMLElement>, value: DraftMode | null) => {
      if (value) {
        setDraftMode(value);
      }
    },
    [setDraftMode]
  );

  return (
    <Panel
      title="Cost estimate"
      subtitle="Plan generation before you spend"
      padding="normal"
    >
      <FlexColumn gap={SPACING.md}>
        {over && (
          <AlertBanner severity="warning" title="Over budget">
            The estimated cost{" "}
            {estimate ? formatMoney(estimate.total) : formatMoney(0)} plus
            spent {formatMoney(budget.spent)} exceeds the{" "}
            {formatMoney(budget.cap)} cap.
          </AlertBanner>
        )}

        <FlexRow gap={SPACING.lg} align="flex-end" wrap>
          <FlexColumn gap={SPACING.xs} sx={{ minWidth: 140 }}>
            <Label>Budget cap ({budget.currency})</Label>
            <TextInput
              type="number"
              value={String(budget.cap)}
              onChange={handleCapChange}
              size="small"
              compact
              inputProps={{ min: 0, step: 0.5 }}
            />
          </FlexColumn>

          <FlexColumn gap={SPACING.xs}>
            <Label>Draft mode</Label>
            <ToggleGroup
              value={draftMode}
              exclusive
              onChange={handleDraftModeChange}
              size="small"
              segmented
            >
              {DRAFT_MODES.map((mode) => (
                <ToggleOption key={mode} value={mode}>
                  {mode}
                </ToggleOption>
              ))}
            </ToggleGroup>
          </FlexColumn>
        </FlexRow>

        <Divider />

        {!estimate ? (
          <EmptyState
            variant="no-data"
            title="No graph loaded"
            description="Open a workflow to see its cost estimate."
            size="small"
          />
        ) : estimate.items.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No nodes"
            description="Add nodes to estimate a run's cost."
            size="small"
          />
        ) : (
          <FlexColumn gap={0}>
            <FlexRow
              gap={SPACING.sm}
              sx={{ py: 0.5, opacity: 0.7 }}
            >
              <Caption sx={{ flex: 2 }}>Node</Caption>
              <Caption sx={{ flex: 2 }}>Provider / model</Caption>
              <Caption sx={{ flex: 1, textAlign: "right" }}>Qty</Caption>
              <Caption sx={{ flex: 1, textAlign: "right" }}>Cost</Caption>
            </FlexRow>
            <Divider />
            {estimate.items.map((item) => (
              <FlexRow
                key={item.node_id}
                gap={SPACING.sm}
                align="center"
                sx={{ py: 0.5 }}
              >
                <Text
                  sx={{
                    flex: 2,
                    fontSize: "var(--fontSizeSmall)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}
                >
                  {item.node_type}
                </Text>
                <FlexRow sx={{ flex: 2, minWidth: 0 }} align="center" gap={0.5}>
                  {item.confidence === "unknown" ? (
                    <Chip label="unknown price" color="warning" compact />
                  ) : (
                    <Text
                      sx={{
                        fontSize: "var(--fontSizeSmall)",
                        color: theme.vars.palette.text.secondary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {item.provider}
                      {item.model ? ` · ${item.model}` : ""}
                    </Text>
                  )}
                </FlexRow>
                <Text
                  sx={{
                    flex: 1,
                    textAlign: "right",
                    fontSize: "var(--fontSizeSmall)"
                  }}
                >
                  {item.quantity}
                </Text>
                <Text
                  sx={{
                    flex: 1,
                    textAlign: "right",
                    fontSize: "var(--fontSizeSmall)",
                    fontWeight: 600
                  }}
                >
                  {item.confidence === "unknown"
                    ? "—"
                    : formatMoney(item.estimated_cost)}
                </Text>
              </FlexRow>
            ))}
            <Divider />
            <Card variant="outlined" padding="compact" sx={{ mt: SPACING.sm }}>
              <FlexRow justify="space-between" align="center">
                <Text sx={{ fontWeight: 600 }}>
                  Total ({estimate.currency})
                </Text>
                <Text sx={{ fontWeight: 700 }}>
                  {formatMoney(estimate.total)}
                </Text>
              </FlexRow>
              {estimate.unknown_count > 0 && (
                <Caption sx={{ color: theme.vars.palette.warning.main }}>
                  {estimate.unknown_count} node
                  {estimate.unknown_count === 1 ? "" : "s"} without a known
                  price are excluded from the total.
                </Caption>
              )}
            </Card>
          </FlexColumn>
        )}
      </FlexColumn>
    </Panel>
  );
};

export const WorkflowCostEstimatePanel = memo(
  WorkflowCostEstimatePanelInternal
);
export default WorkflowCostEstimatePanel;
