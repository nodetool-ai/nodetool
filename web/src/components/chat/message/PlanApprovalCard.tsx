/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { EditorButton } from "../../editor_ui";
import {
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  BORDER_RADIUS
} from "../../ui_primitives";
import type {
  PendingPlanApproval,
  PlanDecision
} from "../../../stores/GlobalChatStore";

interface PlanApprovalCardProps {
  approvalId: string;
  approval: PendingPlanApproval;
  onResolve: (
    approvalId: string,
    decision: PlanDecision,
    feedback?: string
  ) => void;
}

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    ".plan-approval-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(2),
      padding: theme.spacing(1.5, 2),
      borderBottom: `1px solid ${theme.vars.palette.divider}`
    },
    ".plan-approval-counts": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
      marginLeft: "auto"
    },
    ".plan-approval-tasks": {
      padding: theme.spacing(1.5, 2)
    },
    ".plan-task-index": {
      width: 20,
      height: 20,
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
      marginTop: theme.spacing(1.5)
    },
    ".plan-task-deps": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      whiteSpace: "nowrap"
    },
    ".plan-step": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1),
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.45,
      "&::before": {
        content: '""',
        width: 4,
        height: 4,
        borderRadius: BORDER_RADIUS.circle,
        background: theme.vars.palette.text.disabled,
        flexShrink: 0,
        marginTop: "0.5em"
      }
    },
    ".plan-approval-footer": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.5),
      padding: theme.spacing(1.5, 2),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    }
  });

/**
 * Inline approval prompt for an agent's proposed execution plan. Shows the
 * plan title and its tasks/steps, with an optional feedback field. Approve
 * starts execution; Reject with feedback asks the agent to revise the plan;
 * Reject without feedback aborts the run.
 */
const PlanApprovalCard: React.FC<PlanApprovalCardProps> = ({
  approvalId,
  approval,
  onResolve
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const [feedback, setFeedback] = useState("");

  const { plan } = approval;
  const totalSteps = plan.tasks.reduce((sum, t) => sum + t.steps.length, 0);

  const handleApprove = useCallback(
    () => onResolve(approvalId, "approve"),
    [approvalId, onResolve]
  );
  const handleReject = useCallback(
    () => onResolve(approvalId, "reject", feedback.trim() || undefined),
    [approvalId, feedback, onResolve]
  );
  const handleFeedbackChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setFeedback(e.target.value),
    []
  );

  const hasFeedback = feedback.trim().length > 0;

  return (
    <div css={cssStyles} className="plan-approval-card" role="group">
      <div className="plan-approval-header">
        <FlexColumn gap={0}>
          <Text size="small" weight={500}>
            Execution plan
          </Text>
          <Text size="smaller" color="secondary">
            {plan.title}
          </Text>
        </FlexColumn>
        <span className="plan-approval-counts">
          {plan.tasks.length} tasks · {totalSteps} steps
        </span>
      </div>
      <div className="plan-approval-tasks">
        {plan.tasks.map((task, i) => (
          <FlexColumn key={task.id} className="plan-task" gap={0.5}>
            <FlexRow align="center" gap={1}>
              <span className="plan-task-index">{i + 1}</span>
              <Text size="small" weight={500} sx={{ minWidth: 0 }}>
                {task.title}
              </Text>
              {task.depends_on.length > 0 && (
                <span className="plan-task-deps">
                  after {task.depends_on.join(", ")}
                </span>
              )}
            </FlexRow>
            <FlexColumn gap={0.25} sx={{ pl: 3.5 }}>
              {task.steps.map((step) => (
                <span key={step.id} className="plan-step">
                  {step.instructions}
                </span>
              ))}
            </FlexColumn>
          </FlexColumn>
        ))}
      </div>
      <div className="plan-approval-footer">
        <TextInput
          size="small"
          compact
          placeholder="Request changes (optional) — sent to the agent on reject"
          value={feedback}
          onChange={handleFeedbackChange}
          multiline
          maxRows={3}
        />
        <FlexRow gap={1} align="center" justify="flex-end">
          <EditorButton
            variant="outlined"
            color="error"
            density="normal"
            onClick={handleReject}
            startIcon={<CloseRoundedIcon />}
          >
            {hasFeedback ? "Reject with feedback" : "Reject"}
          </EditorButton>
          <EditorButton
            variant="contained"
            color="primary"
            density="normal"
            onClick={handleApprove}
            startIcon={<PlayArrowRoundedIcon />}
          >
            Approve & run
          </EditorButton>
        </FlexRow>
      </div>
    </div>
  );
};

export default memo(PlanApprovalCard);
