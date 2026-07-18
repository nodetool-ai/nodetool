/**
 * CostTicker
 *
 * A compact pill showing the live provider spend for a workflow's active run.
 * Clicking opens a Popover with the pre-run cost estimate (total, how many
 * nodes have no known price, and the biggest contributors) plus the budget
 * remaining. Mirrors the chip + popover shape of the per-node pricing footers.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import {
  Popover,
  Divider,
  Text,
  Caption,
  FlexColumn,
  FlexRow,
  StatusIndicator,
  BORDER_RADIUS,
  Z_INDEX
} from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import { budgetRemaining } from "@nodetool-ai/protocol";
import { useLiveRunCost } from "../../hooks/useLiveRunCost";
import { useWorkflowCostEstimate } from "../../hooks/useWorkflowCostEstimate";
import { useBudgetStore, selectBudget } from "../../stores/BudgetStore";
import { formatMoney } from "./costsData";

export interface CostTickerProps {
  workflowId: string;
}

const TOP_CONTRIBUTORS = 3;

const CostTickerInternal: React.FC<CostTickerProps> = ({ workflowId }) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  const live = useLiveRunCost(workflowId);
  const estimate = useWorkflowCostEstimate(workflowId);
  const budget = useBudgetStore(useShallow(selectBudget));

  const remaining = useMemo(() => budgetRemaining(budget), [budget]);
  const overBudget = remaining <= 0 || (estimate ? estimate.total > remaining : false);

  const topContributors = useMemo(() => {
    if (!estimate) {
      return [];
    }
    return [...estimate.items]
      .filter((item) => item.estimated_cost > 0)
      .sort((a, b) => b.estimated_cost - a.estimated_cost)
      .slice(0, TOP_CONTRIBUTORS);
  }, [estimate]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setAnchorEl(e.currentTarget);
  }, []);

  const handleClose = useCallback(() => setAnchorEl(null), []);

  const tier = overBudget
    ? theme.vars.palette.warning
    : theme.vars.palette.success;

  return (
    <>
      <EditorButton
        variant="text"
        className="cost-ticker nodrag nopan"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={handleClick}
        sx={{
          bgcolor: tier.dark,
          color: tier.contrastText,
          px: 1,
          py: 0,
          height: 22,
          borderRadius: BORDER_RADIUS.xs,
          fontSize: "var(--fontSizeSmall)",
          fontWeight: 600,
          lineHeight: 1.4,
          minHeight: 0,
          textTransform: "none",
          whiteSpace: "nowrap",
          cursor: "pointer",
          flexShrink: 0,
          zIndex: Z_INDEX.toast,
          "&:hover": { bgcolor: tier.main }
        }}
      >
        {`Spend ${formatMoney(live.total)}`}
      </EditorButton>

      <Popover
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleClose}
        placement="bottom-right"
        paperSx={{ minWidth: 240, fontSize: "var(--fontSizeSmall)" }}
      >
        <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
          <Caption
            sx={{
              fontWeight: 600,
              color: tier.main,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}
          >
            Live run spend
          </Caption>
          <Text
            sx={{
              fontSize: "var(--fontSizeBig)",
              fontWeight: 700,
              color: theme.vars.palette.text.primary,
              mt: 0.5
            }}
          >
            {formatMoney(live.total)} {live.currency}
          </Text>
        </FlexColumn>

        <Divider />

        <FlexColumn gap={0.5} sx={{ px: 2, py: 1 }}>
          <Caption
            sx={{
              fontWeight: 600,
              color: theme.vars.palette.text.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}
          >
            Pre-run estimate
          </Caption>
          {estimate ? (
            <>
              <Text
                sx={{
                  fontSize: "var(--fontSizeSmall)",
                  fontWeight: 600,
                  color: theme.vars.palette.text.primary
                }}
              >
                {formatMoney(estimate.total)} {estimate.currency}
              </Text>
              {estimate.unknown_count > 0 && (
                <Text
                  sx={{
                    fontSize: "var(--fontSizeSmall)",
                    color: theme.vars.palette.warning.main
                  }}
                >
                  {estimate.unknown_count} node
                  {estimate.unknown_count === 1 ? "" : "s"} with unknown price
                </Text>
              )}
              {topContributors.map((item) => (
                <FlexRow
                  key={item.node_id}
                  justify="space-between"
                  gap={1}
                  sx={{ mt: 0.25 }}
                >
                  <Text
                    sx={{
                      fontSize: "var(--fontSizeSmaller)",
                      color: theme.vars.palette.text.secondary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {item.model ?? item.node_type}
                  </Text>
                  <Text
                    sx={{
                      fontSize: "var(--fontSizeSmaller)",
                      color: theme.vars.palette.text.primary,
                      flexShrink: 0
                    }}
                  >
                    {formatMoney(item.estimated_cost)}
                  </Text>
                </FlexRow>
              ))}
            </>
          ) : (
            <Text
              sx={{
                fontSize: "var(--fontSizeSmall)",
                color: theme.vars.palette.text.disabled
              }}
            >
              No graph loaded
            </Text>
          )}
        </FlexColumn>

        <Divider />

        <FlexColumn gap={0.5} sx={{ px: 2, py: 1 }}>
          <Caption
            sx={{
              fontWeight: 600,
              color: theme.vars.palette.text.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}
          >
            Budget
          </Caption>
          <FlexRow align="center" gap={1}>
            <StatusIndicator
              status={overBudget ? "warning" : "success"}
              label={`${formatMoney(remaining)} remaining`}
              size="small"
            />
          </FlexRow>
          <Text
            sx={{
              fontSize: "var(--fontSizeSmaller)",
              color: theme.vars.palette.text.secondary
            }}
          >
            Cap {formatMoney(budget.cap)} · spent {formatMoney(budget.spent)}
          </Text>
        </FlexColumn>
      </Popover>
    </>
  );
};

export const CostTicker = memo(CostTickerInternal);
export default CostTicker;
