import type { ReactNode } from "react";
import { getShortcutTooltip } from "../../config/shortcuts";

export interface RunControlTooltipState {
  isStopping: boolean;
  isWorkflowActive: boolean;
  runControlLabel: string;
  runControlDetail?: string | null;
  queuePosition?: number | null;
  pendingRunCount: number;
}

/**
 * Tooltip for the canvas composer's "Run entire workflow" button. The idle
 * tooltip is the shortcut element itself: interpolating it into a template
 * string renders "[object Object]".
 */
export const runControlTooltip = ({
  isStopping,
  isWorkflowActive,
  runControlLabel,
  runControlDetail,
  queuePosition,
  pendingRunCount
}: RunControlTooltipState): ReactNode => {
  if (isStopping) {
    return "Stopping workflow";
  }
  if (runControlLabel.startsWith("Error")) {
    return `${runControlDetail ?? "Workflow failed to start"}. Click to retry the entire workflow.`;
  }
  if (queuePosition != null) {
    return `Queued (#${queuePosition})`;
  }
  if (pendingRunCount > 0) {
    return `Running — ${pendingRunCount} queued (click to queue another)`;
  }
  if (isWorkflowActive) {
    return `${runControlLabel} (click to queue another entire workflow run)`;
  }
  return getShortcutTooltip("runWorkflow", undefined, "full", true);
};
