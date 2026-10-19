/**
 * `/integrations/link?code=…` — the confirmation page for a bot-initiated
 * link (telegram-bot-design.md §5).
 *
 * The bridge sent this URL into a chat, so the page is the one phishing-shaped
 * artifact in the flow: it names the external account the code was issued for
 * before anything is written, and the user's own session — never the code —
 * decides which NodeTool account gets linked. An expired or already-spent code
 * says so instead of failing quietly.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertBanner,
  Caption,
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  Text
} from "../ui_primitives";
import { trpcClient } from "../../trpc/client";

type LinkProvider = "telegram" | "discord";

const PROVIDER_LABELS: Record<LinkProvider, string> = {
  telegram: "Telegram",
  discord: "Discord"
};

function providerLabel(provider: string): string {
  return PROVIDER_LABELS[provider as LinkProvider] ?? provider;
}

const IntegrationLinkPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const code = params.get("code") ?? "";

  const describe = useQuery({
    queryKey: ["integrations", "link-code", code],
    queryFn: () => trpcClient.integrations.describeLinkCode.query({ code }),
    enabled: code.length > 0,
    retry: false,
    refetchOnWindowFocus: false
  });

  const confirm = useMutation({
    mutationFn: (provider: string) =>
      trpcClient.integrations.confirmLink.mutate({
        provider: provider as LinkProvider,
        code
      })
  });

  const handleConfirm = useCallback(() => {
    if (describe.data) confirm.mutate(describe.data.provider);
  }, [confirm, describe.data]);

  const handleDone = useCallback(() => {
    void navigate("/workspace");
  }, [navigate]);

  const expired = code.length === 0 || describe.isError;

  return (
    <FlexColumn
      align="center"
      justify="center"
      sx={{ width: "100%", height: "100%", p: SPACING.xl }}
    >
      <Card variant="outlined" padding="comfortable" sx={{ maxWidth: 480 }}>
        <FlexColumn gap={SPACING.lg}>
          {describe.isLoading && !expired && (
            <LoadingSpinner
              text={t("screens4_0.settings.integrationLink.checkingLink")}
            />
          )}

          {expired && (
            <>
              <AlertBanner severity="error">
                {t("screens4_0.settings.integrationLink.expiredCodeStart")}
                <strong> /link </strong>
                {t("screens4_0.settings.integrationLink.expiredCodeEnd")}
              </AlertBanner>
              <FlexRow>
                <EditorButton variant="outlined" onClick={handleDone}>
                  {t("screens4_0.settings.integrationLink.backToNodeTool")}
                </EditorButton>
              </FlexRow>
            </>
          )}

          {describe.data && !confirm.isSuccess && (
            <>
              <Text weight={500}>
                {t("screens4_0.settings.integrationLink.confirmLinkQuestion", {
                  provider: providerLabel(describe.data.provider),
                  id: describe.data.external_id
                })}
              </Text>
              <Caption>
                {t("screens4_0.settings.integrationLink.confirmLinkDescription")}
              </Caption>
              {confirm.isError && (
                <AlertBanner severity="error">
                  {t("screens4_0.settings.integrationLink.confirmLinkFailed")}
                </AlertBanner>
              )}
              <FlexRow gap={SPACING.md}>
                <EditorButton
                  variant="outlined"
                  color="primary"
                  disabled={confirm.isPending}
                  onClick={handleConfirm}
                >
                  {t("screens4_0.settings.integrationLink.confirm")}
                </EditorButton>
                <EditorButton variant="text" onClick={handleDone}>
                  {t("screens4_0.settings.integrationLink.cancel")}
                </EditorButton>
              </FlexRow>
            </>
          )}

          {confirm.isSuccess && (
            <>
              <AlertBanner severity="success">
                {t("screens4_0.settings.integrationLink.linkSucceeded", {
                  provider: providerLabel(describe.data?.provider ?? ""),
                  id: confirm.data.external_id
                })}
              </AlertBanner>
              <FlexRow>
                <EditorButton variant="outlined" onClick={handleDone}>
                  {t("screens4_0.settings.integrationLink.backToNodeTool")}
                </EditorButton>
              </FlexRow>
            </>
          )}
        </FlexColumn>
      </Card>
    </FlexColumn>
  );
};

export default IntegrationLinkPage;
