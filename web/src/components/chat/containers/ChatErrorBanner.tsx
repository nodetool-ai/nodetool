/**
 * The error a failed turn leaves behind, shown above the composer.
 *
 * Without it a refused send or a server error frame only makes the "Thinking…"
 * row disappear, and the user has no message, no way to report it, and no way
 * to try again.
 *
 * A provider failure reads as one action card: what kind of failure it is
 * (billing, quota, key, model unavailable, rate limit), the one fix, and a
 * switch to a model that does not share the failure. When the same failure
 * comes back, Retry gives way to the switch, because a refused account or a
 * missing model fails the same way every time.
 */
import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  latestRecentFailure,
  useProviderCallFailureStore
} from "../../../stores/ProviderCallFailureStore";
import type { LanguageModel } from "../../../stores/ApiTypes";
import ProviderFailureReportButton from "../../support/ProviderFailureReportButton";
import { openSettingsTab } from "../../workspace/openPageTab";
import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../../ui_primitives";
import { useAlternativeLanguageModel } from "../../../hooks/useAlternativeLanguageModel";
import {
  REPEAT_FAILURE_THRESHOLD,
  providerBillingUrl,
  summarizeProviderCallFailure,
  summarizeProviderErrorText,
  trailingRepeatCount,
  type ProviderFailureSummary
} from "../../../utils/providerFailure";

interface ChatErrorBannerProps {
  error: string;
  onDismiss: () => void;
  /** Omitted when there is nothing to retry, or a turn is already running. */
  onRetry?: () => void;
  /** The model the failed turn used. */
  model?: LanguageModel;
  /** Switches the chat's model. Omitted where the surface has no picker. */
  onModelChange?: (model: LanguageModel) => void;
  allowedProviders?: string[];
  requireToolSupport?: boolean;
}

const CATEGORIES_WITH_CARD = new Set([
  "billing",
  "quota",
  "auth",
  "model_unavailable",
  "rate_limit"
]);

const ChatErrorBanner = ({
  error,
  onDismiss,
  onRetry,
  model,
  onModelChange,
  allowedProviders,
  requireToolSupport
}: ChatErrorBannerProps) => {
  const { t } = useTranslation();
  const failures = useProviderCallFailureStore((state) => state.failures);

  const { summary, repeats } = useMemo((): {
    summary: ProviderFailureSummary;
    repeats: number;
  } => {
    const latest = latestRecentFailure(failures);
    // The store holds failures from every surface. Trust the frame only when
    // the banner's text is about the same call: it names the model, or it
    // carries the provider's message.
    const sameCall =
      latest !== undefined &&
      ((latest.model ? error.includes(latest.model) : false) ||
        error.includes(latest.message.slice(0, 60)));
    if (latest && sameCall) {
      return {
        summary: summarizeProviderCallFailure(latest),
        repeats: trailingRepeatCount(failures)
      };
    }
    return { summary: summarizeProviderErrorText(error), repeats: 1 };
  }, [failures, error]);

  const alternative = useAlternativeLanguageModel(
    onModelChange ? summary : null,
    { current: model, allowedProviders, requireToolSupport }
  );

  const handleSwitch = useCallback(() => {
    if (alternative && onModelChange) {
      onModelChange(alternative);
      onDismiss();
    }
  }, [alternative, onModelChange, onDismiss]);

  const handleOpenKeys = useCallback(() => openSettingsTab("providers"), []);

  const billingUrl =
    summary.category === "billing" || summary.category === "quota"
      ? providerBillingUrl(summary.provider ?? model?.provider)
      : undefined;
  const handleOpenBilling = useCallback(() => {
    if (billingUrl) {
      window.open(billingUrl, "_blank", "noopener,noreferrer");
    }
  }, [billingUrl]);

  const hasCard = CATEGORIES_WITH_CARD.has(summary.category);
  const repeated = summary.switchModel && repeats >= REPEAT_FAILURE_THRESHOLD;
  const target =
    summary.provider && summary.model
      ? `${summary.provider}/${summary.model}`
      : summary.provider ??
        (model ? `${model.provider}/${model.id}` : t("providerFailure.genericTarget"));

  const retryButton = onRetry && !repeated && (
    <EditorButton density="compact" onClick={onRetry}>
      {t("i18n-next11.chat.retry")}
    </EditorButton>
  );

  if (!hasCard) {
    return (
      <AlertBanner
        className="chat-error-banner"
        severity="error"
        compact
        onClose={onDismiss}
      >
        <FlexRow align="center" gap={SPACING.sm} wrap>
          <Text
            component="span"
            size="small"
            sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
          >
            {error}
          </Text>
          <ProviderFailureReportButton errorText={error} />
          {retryButton}
        </FlexRow>
      </AlertBanner>
    );
  }

  return (
    <AlertBanner
      className={`chat-error-banner provider-failure-${summary.category}`}
      severity={summary.category === "rate_limit" ? "warning" : "error"}
      compact
      onClose={onDismiss}
    >
      <FlexColumn gap={SPACING.xs} sx={{ minWidth: 0 }}>
        <Text component="span" size="small">
          {t(`providerFailure.title.${summary.category}`, { target })}
        </Text>
        <Text component="span" size="small" weight={400}>
          {repeated
            ? t("providerFailure.repeated")
            : t(`providerFailure.hint.${summary.category}`)}
        </Text>
        <Caption
          component="span"
          sx={{ overflowWrap: "anywhere" }}
          className="chat-error-detail"
        >
          {error}
        </Caption>
        <FlexRow align="center" gap={SPACING.sm} wrap>
          {alternative && (
            <EditorButton
              density="compact"
              variant={repeated ? "contained" : "outlined"}
              onClick={handleSwitch}
            >
              {t("providerFailure.switchTo", { model: alternative.name })}
            </EditorButton>
          )}
          {summary.category === "auth" && (
            <EditorButton density="compact" onClick={handleOpenKeys}>
              {t("providerFailure.openKeys")}
            </EditorButton>
          )}
          {billingUrl && (
            <EditorButton density="compact" onClick={handleOpenBilling}>
              {summary.category === "quota"
                ? t("providerFailure.enableBilling")
                : t("providerFailure.addCredit")}
            </EditorButton>
          )}
          {retryButton}
          <ProviderFailureReportButton errorText={error} />
        </FlexRow>
      </FlexColumn>
    </AlertBanner>
  );
};

export default memo(ChatErrorBanner);
