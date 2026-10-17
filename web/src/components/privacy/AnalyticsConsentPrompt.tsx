/**
 * Asks once whether to share anonymous usage statistics, after the person's
 * first successful run, never at startup and never as a modal. Answering
 * either way, or ignoring it until the next reload, records that it was
 * asked, so it does not come back. Settings → Privacy changes the answer.
 */
import React, { memo, useCallback, useEffect, useState, useSyncExternalStore } from "react";
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
      aria-label="Usage statistics"
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
          Help improve NodeTool?
        </Text>
        <Text size="small">
          Share anonymous usage statistics such as how many workflows run and
          how often they fail. No prompts, workflow content, file names or
          account details are sent.{" "}
          <TextLink asButton onClick={handleDetails}>
            See exactly what is sent
          </TextLink>
        </Text>
        <FlexRow gap={GAP.normal} justify="flex-end">
          <EditorButton size="small" variant="text" onClick={() => answer(false)}>
            No thanks
          </EditorButton>
          <EditorButton size="small" variant="contained" onClick={() => answer(true)}>
            Share statistics
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Card>
  );
};

export default memo(AnalyticsConsentPrompt);
