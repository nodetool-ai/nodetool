/**
 * The one control every error surface uses to reach the bug-report dialog.
 * Keeping it in one place is what makes "Report" mean the same thing on a
 * failed node, a crashed panel and a failed job.
 */
import { memo, useCallback } from "react";
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
  label = "Report",
  variant = "text",
  size = "small",
  className
}: ReportBugButtonProps) => {
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      openBugReport(context);
    },
    [context]
  );

  return (
    <Tooltip title="Report this as a bug">
      <EditorButton
        className={className}
        variant={variant}
        size={size}
        onClick={handleClick}
        startIcon={<BugReportIcon fontSize="inherit" />}
      >
        {label}
      </EditorButton>
    </Tooltip>
  );
};

export default memo(ReportBugButton);
