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
            <FlexRow align="center" gap={SPACING.md}>
              <LoadingSpinner />
              <Caption>Checking this link…</Caption>
            </FlexRow>
          )}

          {expired && (
            <>
              <AlertBanner severity="error">
                This link code has expired or was already used. Send the bot
                <strong> /link </strong>
                again to get a new one.
              </AlertBanner>
              <FlexRow>
                <EditorButton variant="outlined" onClick={handleDone}>
                  Back to NodeTool
                </EditorButton>
              </FlexRow>
            </>
          )}

          {describe.data && !confirm.isSuccess && (
            <>
              <Text weight={500}>
                Link {providerLabel(describe.data.provider)} account{" "}
                {describe.data.external_id}?
              </Text>
              <Caption>
                It will run as your NodeTool account — your threads, assets,
                secrets, and budget.
              </Caption>
              {confirm.isError && (
                <AlertBanner severity="error">
                  Could not complete the link. The code may have just expired.
                </AlertBanner>
              )}
              <FlexRow gap={SPACING.md}>
                <EditorButton
                  variant="outlined"
                  color="primary"
                  disabled={confirm.isPending}
                  onClick={handleConfirm}
                >
                  Confirm
                </EditorButton>
                <EditorButton variant="text" onClick={handleDone}>
                  Cancel
                </EditorButton>
              </FlexRow>
            </>
          )}

          {confirm.isSuccess && (
            <>
              <AlertBanner severity="success">
                {providerLabel(describe.data?.provider ?? "")} account{" "}
                {confirm.data.external_id} is linked. Go back to the chat and
                say hello.
              </AlertBanner>
              <FlexRow>
                <EditorButton variant="outlined" onClick={handleDone}>
                  Back to NodeTool
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
