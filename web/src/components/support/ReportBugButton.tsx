/**
 * The one control every error surface uses to reach the bug-report dialog.
 * Keeping it in one place is what makes "Report" mean the same thing on a
 * failed node, a crashed panel and a failed job.
 */
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import BugReportIcon from "@mui/icons-material/BugReport";
import { EditorButton, Tooltip } from "../ui_primitives";
import { openBugReport } from "../../stores/BugReportStore";
import type { BugReportContext } from "../../utils/bugReportBundle";

interface ReportBugButtonProps {
  context: BugReportContext;
  label?: string;
  variant?: "text" | "outlined" | "contained";
  size?: "small" | "medium" | "large";
  className?: string;
}

const ReportBugButton = ({
  context,
  label,
  variant = "text",
  size = "small",
  className
}: ReportBugButtonProps) => {
  const { t } = useTranslation();
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      openBugReport(context);
    },
    [context]
  );

  return (
    // `describeChild` keeps the visible label as the button's accessible name.
    // Without it MUI turns the tooltip into an `aria-label`, so the name a
    // screen reader announces no longer contains the text on screen.
    <Tooltip title={t("screens4_10.support.reportBug.tooltip")} describeChild>
      <EditorButton
        className={className}
        variant={variant}
        size={size}
        onClick={handleClick}
        startIcon={<BugReportIcon />}
      >
        {label ?? t("screens4_10.support.reportBug.button")}
      </EditorButton>
    </Tooltip>
  );
};

export default memo(ReportBugButton);
