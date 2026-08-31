/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Caption,
  FlexColumn,
  FlexRow,
  Text,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../../ui_primitives";
import type { PlanDocumentModel } from "./parsePlanDocument";

interface PlanDocumentProps {
  plan: PlanDocumentModel;
  /**
   * When false, the parent already supplies the frame (the approval card).
   * Tool-result rendering leaves the default on so the plan reads as a
   * document, not as JSON in a collapsed row.
   */
  framed?: boolean;
}

const styles = (theme: Theme) =>
  css({
    "&.framed": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      overflow: "hidden"
    },
    ".plan-document-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(SPACING.md),
      padding: theme.spacing(SPACING.sm, SPACING.md),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".plan-document-counts": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      marginLeft: "auto"
    },
    ".plan-document-tasks": {
      padding: theme.spacing(SPACING.sm, SPACING.md)
    },
    ".plan-task-index": {
      width: getSpacingPx(5),
      height: getSpacingPx(5),
      borderRadius: BORDER_RADIUS.circle,
      border: `1px solid ${theme.vars.palette.divider}`,
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmaller)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0
    },
    ".plan-task + .plan-task": {
      marginTop: theme.spacing(SPACING.sm)
    },
    ".plan-task-deps": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      minWidth: 0
    },
    ".plan-step": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(SPACING.xs),
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.45,
      "&::before": {
        content: '""',
        width: theme.spacing(SPACING.xs),
        height: theme.spacing(SPACING.xs),
        borderRadius: BORDER_RADIUS.circle,
        background: theme.vars.palette.text.disabled,
        flexShrink: 0,
        marginTop: "0.5em"
      }
    },
    ".plan-document-note": {
      padding: theme.spacing(SPACING.sm, SPACING.md),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    }
  });

const plural = (count: number, word: string): string =>
  count === 1 ? `1 ${word}` : `${count} ${word}s`;

const PlanDocument: React.FC<PlanDocumentProps> = ({
  plan,
  framed = true
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const stepCount = plan.tasks.reduce((sum, task) => sum + task.steps.length, 0);
  const titleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of plan.tasks) {
      map.set(task.id, task.title);
    }
    return map;
  }, [plan.tasks]);

  const counts = [
    plural(plan.tasks.length, "task"),
    plural(stepCount, "step"),
    plan.parallelizable > 1
      ? `${plan.parallelizable} can run together`
      : null
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      css={cssStyles}
      className={framed ? "plan-document framed" : "plan-document"}
      role="article"
      aria-label={plan.title}
    >
      <div className="plan-document-header">
        <FlexColumn gap={SPACING.none}>
          <Text size="small" weight={500}>
            Plan
          </Text>
          <Text size="smaller" color="secondary">
            {plan.title}
          </Text>
        </FlexColumn>
        <span className="plan-document-counts">{counts}</span>
      </div>
      <div className="plan-document-tasks">
        {plan.tasks.map((task, i) => {
          const depTitles = task.dependsOn
            .map((id) => titleById.get(id) ?? id)
            .filter(Boolean);
          return (
            <FlexRow
              key={task.id}
              className="plan-task"
              align="flex-start"
              gap={SPACING.md}
            >
              <span className="plan-task-index">{i + 1}</span>
              <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0, flex: 1 }}>
                <FlexRow align="center" gap={SPACING.md} sx={{ minWidth: 0 }}>
                  <Text size="small" weight={500} sx={{ minWidth: 0 }}>
                    {task.title}
                  </Text>
                  {depTitles.length > 0 && (
                    <span className="plan-task-deps">
                      after {depTitles.join(", ")}
                    </span>
                  )}
                </FlexRow>
                {task.steps.map((step) => (
                  <span key={step.id} className="plan-step">
                    {step.instructions}
                  </span>
                ))}
              </FlexColumn>
            </FlexRow>
          );
        })}
      </div>
      {plan.executed === false && (
        <Caption size="smaller" color="secondary" className="plan-document-note">
          Nothing ran. Switch to Default or Auto to execute.
        </Caption>
      )}
    </div>
  );
};

export default memo(PlanDocument);
