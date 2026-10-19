/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { EditorButton } from "../../editor_ui";
import {
  Card,
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  Tooltip,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
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
    ".plan-approval-fallback": {
      padding: theme.spacing(SPACING.md, SPACING.lg)
    },
    ".plan-approval-footer": {
      padding: theme.spacing(SPACING.md, SPACING.lg, SPACING.lg),
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".plan-approval-actions": {
      button: {
        ...TYPOGRAPHY.sans.label,
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
  const { t } = useTranslation();
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
    <Card
      variant="inline"
      tone="info"
      css={cssStyles}
      className="plan-approval-card"
      role="group"
      aria-label={t("i18n-next19.chat.planApprovalCard.question")}
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
          label={t("i18n-next19.chat.planApprovalCard.feedbackLabel")}
          hideLabel
          placeholder={t("i18n-next19.chat.planApprovalCard.feedbackPlaceholder")}
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
            {t("i18n-next19.chat.planApprovalCard.run")}
          </EditorButton>
          <Tooltip
            title={t("i18n-next19.chat.planApprovalCard.reviseTooltip")}
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
                {t("i18n-next19.chat.planApprovalCard.revise")}
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
            {t("i18n-next19.chat.planApprovalCard.dontRun")}
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Card>
  );
};

export default memo(PlanApprovalCard);
