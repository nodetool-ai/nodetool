/**
 * The error box for a surface whose load or operation failed: an
 * `AlertBanner` with the Report control every error surface needs, and an
 * optional retry beside it. Use it in place of red `Text`/`Caption` so a
 * failure reads as a failure and the user can send it on.
 *
 * Inline validation next to a field is not a failure surface; keep that in the
 * field's helper text.
 */
import { memo, type MouseEvent, type ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import ReportBugButton from "./ReportBugButton";
import { AlertBanner, EditorButton, FlexRow, GAP } from "../ui_primitives";
import type { BugReportContext } from "../../utils/bugReportBundle";

interface ErrorBannerProps {
  /** What failed, in the user's words. */
  children: ReactNode;
  /** What the bug report carries. `summary` becomes the issue title. */
  report: BugReportContext;
  /** Bold first line, for a banner that fills a panel. */
  title?: string;
  onRetry?: (event: MouseEvent) => void;
  retryLabel?: string;
  /** Reduced padding, for inspectors, rows and menus. Defaults to true. */
  compact?: boolean;
  sx?: SxProps<Theme>;
  className?: string;
  "data-testid"?: string;
}

const ErrorBanner = ({
  children,
  report,
  title,
  onRetry,
  retryLabel = "Try again",
  compact = true,
  sx,
  className,
  "data-testid": testId
}: ErrorBannerProps) => (
  <AlertBanner
    severity="error"
    title={title}
    compact={compact}
    sx={sx}
    className={className}
    data-testid={testId}
    action={
      <FlexRow gap={GAP.tight} align="center">
        {onRetry && (
          <EditorButton size="small" variant="text" onClick={onRetry}>
            {retryLabel}
          </EditorButton>
        )}
        <ReportBugButton context={report} />
      </FlexRow>
    }
  >
    {children}
  </AlertBanner>
);

export default memo(ErrorBanner);
