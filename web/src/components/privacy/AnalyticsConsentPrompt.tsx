/**
 * Asks once whether to share anonymous usage statistics, after the person's
 * first successful run, never at startup and never as a modal. Answering
 * either way, or ignoring it until the next reload, records that it was
 * asked, so it does not come back. Settings → Privacy changes the answer.
 */
import React, { memo, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { useProductAnalytics } from "../../hooks/useProductAnalytics";
import {
  isConsentPromptRequested,
  subscribeConsentPrompt
} from "../../lib/analytics";
import { openSettingsTab } from "../workspace/openPageTab";
import {
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  SPACING,
  Text,
  TextLink,
  Z_INDEX
} from "../ui_primitives";

const AnalyticsConsentPrompt: React.FC = () => {
  const { t } = useTranslation();
  const { client, consent } = useProductAnalytics();
  const requested = useSyncExternalStore(
    subscribeConsentPrompt,
    isConsentPromptRequested
  );
  const [open, setOpen] = useState(false);

  const due =
    requested &&
    client !== null &&
    consent?.productAnalytics === "unset" &&
    consent.promptedAt === null;

  useEffect(() => {
    if (due && !open) {
      setOpen(true);
      void client?.markPrompted();
    }
  }, [client, due, open]);

  const answer = useCallback(
    (granted: boolean) => {
      void client?.setConsent("productAnalytics", granted ? "granted" : "denied");
      setOpen(false);
    },
    [client]
  );

  const handleDetails = useCallback(() => {
    openSettingsTab("privacy");
  }, []);

  if (!open) {
    return null;
  }

  return (
    <Card
      role="region"
      aria-label={t("screen_shell.privacy.usageStatistics")}
      variant="elevated"
      padding="comfortable"
      sx={{
        position: "fixed",
        right: SPACING.xl,
        bottom: SPACING.xl,
        maxWidth: "24rem",
        zIndex: Z_INDEX.toast
      }}
    >
      <FlexColumn gap={GAP.normal}>
        <Text size="normal" weight={500}>
          {t("screen_shell.privacy.title")}
        </Text>
        <Text size="small">
          {t("screen_shell.privacy.description")}{" "}
          <TextLink asButton onClick={handleDetails}>
            {t("screen_shell.privacy.details")}
          </TextLink>
        </Text>
        <FlexRow gap={GAP.normal} justify="flex-end">
          <EditorButton size="small" variant="text" onClick={() => answer(false)}>
            {t("screen_shell.privacy.noThanks")}
          </EditorButton>
          <EditorButton size="small" variant="contained" onClick={() => answer(true)}>
            {t("screen_shell.privacy.share")}
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Card>
  );
};

export default memo(AnalyticsConsentPrompt);
