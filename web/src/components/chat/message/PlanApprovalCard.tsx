/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { EditorButton } from "../../editor_ui";
import {
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  Tooltip,
  BORDER_RADIUS,
  SPACING
} from "../../ui_primitives";
import type {
  PendingPlanApproval,
  PlanDecision
} from "../../../stores/GlobalChatStore";
import PlanDocument from "./PlanDocument";
import { parsePlanDocument } from "./parsePlanDocument";

interface PlanApprovalCardProps {
  approvalId: string;
  approval: PendingPlanApproval;
  onResolve: (
    approvalId: string,
    decision: PlanDecision,
    feedback?: string
  ) => void;
}

const QUESTION = "Run this plan?";

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.info.main}66`,
    borderRadius: BORDER_RADIUS.lg,
    background: `rgb(${theme.vars.palette.info.mainChannel} / 0.06)`,
    overflow: "hidden",
    ".plan-approval-fallback": {
      padding: theme.spacing(SPACING.md, SPACING.lg)
    },
    ".plan-approval-footer": {
      padding: theme.spacing(SPACING.md, SPACING.lg, SPACING.lg),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".plan-approval-actions": {
      button: {
        borderRadius: BORDER_RADIUS.pill,
        textTransform: "none",
        letterSpacing: 0
      },
      ".plan-approval-dismiss": {
        marginLeft: "auto"
      }
    }
  });

/**
 * Inline approval prompt for an agent's proposed execution plan. The plan
 * is the content; the footer asks one question with three answers: run it,
 * revise it (needs a note), or don't run it.
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
  const planDocument = useMemo(() => parsePlanDocument(plan), [plan]);
  const hasFeedback = feedback.trim().length > 0;

  const handleApprove = useCallback(
    () => onResolve(approvalId, "approve"),
    [approvalId, onResolve]
  );
  const handleRevise = useCallback(() => {
    const note = feedback.trim();
    if (!note) {
      return;
    }
    onResolve(approvalId, "reject", note);
  }, [approvalId, feedback, onResolve]);
  const handleDismiss = useCallback(
    () => onResolve(approvalId, "reject"),
    [approvalId, onResolve]
  );
  const handleFeedbackChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => setFeedback(e.target.value),
    []
  );
  const handleFeedbackKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleRevise();
      }
    },
    [handleRevise]
  );

  return (
    <div
      css={cssStyles}
      className="plan-approval-card"
      role="group"
      aria-label={QUESTION}
    >
      {planDocument ? (
        <PlanDocument plan={planDocument} framed={false} />
      ) : (
        <Text size="big" className="plan-approval-fallback">
          {plan.title}
        </Text>
      )}
      <FlexColumn className="plan-approval-footer" gap={SPACING.md}>
        <TextInput
          size="small"
          compact
          label="What should change?"
          hideLabel
          placeholder="What should change?"
          value={feedback}
          onChange={handleFeedbackChange}
          onKeyDown={handleFeedbackKeyDown}
          multiline
          maxRows={3}
        />
        <FlexRow
          gap={SPACING.md}
          align="center"
          className="plan-approval-actions"
        >
          <EditorButton
            variant="contained"
            color="primary"
            density="normal"
            onClick={handleApprove}
          >
            Run this plan
          </EditorButton>
          <Tooltip
            title="Describe the change first"
            disabled={hasFeedback}
          >
            <span>
              <EditorButton
                variant="text"
                color="primary"
                density="normal"
                disabled={!hasFeedback}
                onClick={handleRevise}
              >
                Revise
              </EditorButton>
            </span>
          </Tooltip>
          <EditorButton
            variant="text"
            color="error"
            density="normal"
            className="plan-approval-dismiss"
            onClick={handleDismiss}
          >
            Don't run
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </div>
  );
};

export default memo(PlanApprovalCard);
