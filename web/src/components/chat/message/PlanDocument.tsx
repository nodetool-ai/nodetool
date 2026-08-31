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
  SPACING
} from "../../ui_primitives";
import type { PlanDocumentModel } from "./parsePlanDocument";

const PLAN_IDLE_NOTE =
  "Nothing ran. Switch to Default or Auto, then send a message.";

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
      padding: theme.spacing(SPACING.md, SPACING.lg),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".plan-document-kicker": {
      textTransform: "uppercase",
      letterSpacing: 1
    },
    ".plan-document-counts": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap"
    },
    ".plan-document-title": {
      wordBreak: "break-word"
    },
    ".plan-document-tasks": {
      padding: theme.spacing(SPACING.md, SPACING.lg, SPACING.lg)
    },
    ".plan-task + .plan-task": {
      marginTop: theme.spacing(SPACING.lg)
    },
    ".plan-task-index": {
      color: theme.vars.palette.text.disabled,
      fontVariantNumeric: "tabular-nums",
      flexShrink: 0,
      minWidth: "1.4em",
      textAlign: "right"
    },
    ".plan-task-deps": {
      color: theme.vars.palette.text.disabled,
      minWidth: 0
    },
    ".plan-document-note": {
      padding: theme.spacing(SPACING.md, SPACING.lg),
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

  const counts = [plural(plan.tasks.length, "task"), plural(stepCount, "step")].join(
    " · "
  );

  return (
    <div
      css={cssStyles}
      className={framed ? "plan-document framed" : "plan-document"}
      role="article"
      aria-label={plan.title}
    >
      <FlexColumn className="plan-document-header" gap={SPACING.xs}>
        <FlexRow
          align="baseline"
          justify="space-between"
          gap={SPACING.md}
          fullWidth
          sx={{ minWidth: 0 }}
        >
          <Caption className="plan-document-kicker" color="secondary">
            Plan
          </Caption>
          <span className="plan-document-counts">{counts}</span>
        </FlexRow>
        <Text
          component="h2"
          size="big"
          className="plan-document-title"
          sx={{ m: SPACING.none }}
        >
          {plan.title}
        </Text>
        {plan.parallelizable > 1 && (
          <Caption color="secondary">
            {plan.parallelizable} can run together
          </Caption>
        )}
      </FlexColumn>
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
              <Text
                component="span"
                size="small"
                className="plan-task-index"
              >
                {i + 1}
              </Text>
              <FlexColumn gap={SPACING.xs} sx={{ minWidth: 0, flex: 1 }}>
                <Text size="small" sx={{ minWidth: 0, wordBreak: "break-word" }}>
                  {task.title}
                </Text>
                {depTitles.length > 0 && (
                  <Caption className="plan-task-deps">
                    after {depTitles.join(", ")}
                  </Caption>
                )}
                {task.steps.map((step) => (
                  <Text
                    key={step.id}
                    size="small"
                    color="secondary"
                    sx={{ wordBreak: "break-word" }}
                  >
                    {step.instructions}
                  </Text>
                ))}
              </FlexColumn>
            </FlexRow>
          );
        })}
      </div>
      {plan.executed === false && (
        <Caption color="secondary" className="plan-document-note">
          {PLAN_IDLE_NOTE}
        </Caption>
      )}
    </div>
  );
};

export default memo(PlanDocument);
