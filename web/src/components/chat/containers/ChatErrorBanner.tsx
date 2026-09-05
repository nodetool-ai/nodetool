/**
 * The error a failed turn leaves behind, shown above the composer.
 *
 * Without it a refused send or a server error frame only makes the "Thinking…"
 * row disappear, and the user has no message, no way to report it, and no way
 * to try again.
 */
import { memo } from "react";

import {
  AlertBanner,
  EditorButton,
  FlexRow,
  SPACING
} from "../../ui_primitives";
import ProviderFailureReportButton from "../../support/ProviderFailureReportButton";

interface ChatErrorBannerProps {
  error: string;
  onDismiss: () => void;
  /** Omitted when there is nothing to retry, or a turn is already running. */
  onRetry?: () => void;
}

const ChatErrorBanner = ({
  error,
  onDismiss,
  onRetry
}: ChatErrorBannerProps) => (
  <AlertBanner
    className="chat-error-banner"
    severity="error"
    compact
    onClose={onDismiss}
  >
    <FlexRow align="center" gap={SPACING.sm}>
      <span>{error}</span>
      <ProviderFailureReportButton errorText={error} />
      {onRetry && (
        <EditorButton density="compact" onClick={onRetry}>
          Retry
        </EditorButton>
      )}
    </FlexRow>
  </AlertBanner>
);

export default memo(ChatErrorBanner);
