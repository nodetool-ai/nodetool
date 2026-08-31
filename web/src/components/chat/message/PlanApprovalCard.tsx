/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { EditorButton } from "../../editor_ui";
import {
  FlexRow,
  TextInput,
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

const styles = (theme: Theme) =>
  css({
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: BORDER_RADIUS.lg,
    overflow: "hidden",
    ".plan-approval-footer": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(SPACING.sm),
      padding: theme.spacing(SPACING.sm, SPACING.md),
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
  const planDocument = useMemo(() => parsePlanDocument(plan), [plan]);

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
      {planDocument && <PlanDocument plan={planDocument} framed={false} />}
      <div className="plan-approval-footer">
        <TextInput
          size="small"
          compact
          placeholder="Request changes (optional). Sent on reject."
          value={feedback}
          onChange={handleFeedbackChange}
          multiline
          maxRows={3}
        />
        <FlexRow gap={SPACING.md} align="center" justify="flex-end">
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
