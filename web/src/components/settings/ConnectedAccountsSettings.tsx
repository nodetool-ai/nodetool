/**
 * Settings → Integrations → Connected accounts.
 *
 * The web half of the account-link flow (telegram-bot-design.md §5). Linking
 * starts here: the card mints a one-time code bound to the signed-in user and
 * renders the `t.me/<bot>?start=<code>` deep link, so the user never has to
 * trust a URL that arrived in a chat. Pressing **Start** in Telegram hands the
 * code to the bridge, which completes the link server-side — which is why the
 * pending state polls `integrations.list` rather than waiting for a callback.
 *
 * The bot-initiated direction lands on `/integrations/link?code=…` instead
 * (`IntegrationLinkPage`); both write the same row.
 */

import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import TelegramIcon from "@mui/icons-material/Telegram";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import {
  AlertBanner,
  Caption,
  Card,
  Code,
  CopyButton,
  EditorButton,
  ExternalLink,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  Text
} from "../ui_primitives";
import { trpcClient } from "../../trpc/client";

/** Providers this card can link. Telegram is the only bridge shipping today. */
const PROVIDER = "telegram" as const;
const PROVIDER_LABEL = "Telegram";

/** How often the pending state re-reads the link list while it waits. */
const PENDING_POLL_MS = 3000;

const CONNECTED_ACCOUNTS_QUERY_KEY = ["integrations", "list"] as const;

interface PendingCode {
  code: string;
  deepLink: string | null;
}

function formatLinkedAt(value: string, locale: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(locale).format(new Date(parsed));
}

const ConnectedAccountsSettings = () => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingCode | null>(null);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: CONNECTED_ACCOUNTS_QUERY_KEY,
    queryFn: () => trpcClient.integrations.list.query(),
    refetchInterval: pending !== null ? PENDING_POLL_MS : false,
    refetchOnWindowFocus: true
  });

  const linked =
    data?.identities.find((identity) => identity.provider === PROVIDER) ?? null;

  // Once the link the user is waiting on has landed, the account replaces the
  // code — the pending state is derived, never a second source of truth.
  const showPending = !linked && pending !== null ? pending : null;

  const createCode = useMutation({
    mutationFn: () =>
      trpcClient.integrations.createLinkCode.mutate({ provider: PROVIDER }),
    onSuccess: (result) => {
      setPending({ code: result.code, deepLink: result.deep_link });
    }
  });

  const unlink = useMutation({
    mutationFn: (externalId: string) =>
      trpcClient.integrations.unlink.mutate({
        provider: PROVIDER,
        external_id: externalId
      }),
    onSuccess: () => {
      setConfirmingDisconnect(false);
      void queryClient.invalidateQueries({
        queryKey: CONNECTED_ACCOUNTS_QUERY_KEY
      });
    }
  });

  const handleConnect = useCallback(() => {
    createCode.mutate();
  }, [createCode]);

  const handleCancel = useCallback(() => {
    setPending(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    if (linked) unlink.mutate(linked.external_id);
  }, [linked, unlink]);

  return (
    <Card variant="outlined" padding="comfortable">
      <FlexColumn gap={SPACING.lg}>
        <FlexRow align="center" gap={SPACING.md}>
          <TelegramIcon fontSize="small" />
          <Text weight={500}>{PROVIDER_LABEL}</Text>
        </FlexRow>

        {isLoading && (
          <LoadingSpinner
            text={t("screens4_0.settings.connectedAccounts.loadingAccounts")}
          />
        )}

        {!isLoading && linked && (
          <FlexColumn gap={SPACING.md}>
            <Text size="small">
              {t("screens4_0.settings.connectedAccounts.connectedAs", {
                provider: PROVIDER_LABEL,
                id: linked.external_id
              })}
            </Text>
            <Caption>
              {t("screens4_0.settings.connectedAccounts.linkedAt", {
                date: formatLinkedAt(
                  linked.linked_at,
                  i18n.resolvedLanguage ?? i18n.language
                )
              })}
            </Caption>
            {confirmingDisconnect ? (
              <FlexRow align="center" gap={SPACING.md}>
                <Caption>
                  {t("screens4_0.settings.connectedAccounts.disconnectConfirm")}
                </Caption>
                <EditorButton
                  color="error"
                  variant="outlined"
                  loading={unlink.isPending}
                  onClick={handleDisconnect}
                >
                  {t("screens4_0.settings.connectedAccounts.disconnect")}
                </EditorButton>
                <EditorButton
                  variant="text"
                  onClick={() => setConfirmingDisconnect(false)}
                >
                  {t("screens4_0.settings.connectedAccounts.keep")}
                </EditorButton>
              </FlexRow>
            ) : (
              <FlexRow>
                <EditorButton
                  variant="outlined"
                  startIcon={<LinkOffIcon />}
                  onClick={() => setConfirmingDisconnect(true)}
                >
                  {t("screens4_0.settings.connectedAccounts.disconnect")}
                </EditorButton>
              </FlexRow>
            )}
            {unlink.isError && (
              <AlertBanner severity="error">
                {t("screens4_0.settings.connectedAccounts.disconnectFailed")}
              </AlertBanner>
            )}
          </FlexColumn>
        )}

        {!isLoading && !linked && showPending === null && (
          <FlexColumn gap={SPACING.md}>
            <Caption>
              {t("screens4_0.settings.connectedAccounts.connectDescription", {
                provider: PROVIDER_LABEL
              })}
            </Caption>
            <FlexRow>
              <EditorButton
                variant="outlined"
                startIcon={<TelegramIcon />}
                loading={createCode.isPending}
                onClick={handleConnect}
              >
                {t("screens4_0.settings.connectedAccounts.connectProvider", {
                  provider: PROVIDER_LABEL
                })}
              </EditorButton>
            </FlexRow>
            {createCode.isError && (
              <AlertBanner severity="error">
                {t("screens4_0.settings.connectedAccounts.startLinkFailed")}
              </AlertBanner>
            )}
          </FlexColumn>
        )}

        {showPending !== null && (
          <FlexColumn gap={SPACING.md}>
            {showPending.deepLink ? (
              <ExternalLink href={showPending.deepLink}>
                {t("screens4_0.settings.connectedAccounts.openTelegram")}
              </ExternalLink>
            ) : (
              <Caption>
                {t("screens4_0.settings.connectedAccounts.noBotUsername")}{" "}
                <Code>/start {showPending.code}</Code>{" "}
                {t("screens4_0.settings.connectedAccounts.sendStartCommand")}
              </Caption>
            )}
            <FlexRow align="center" gap={SPACING.md}>
              <Text size="small" family="secondary">
                {showPending.code}
              </Text>
              <CopyButton
                value={showPending.code}
                tooltip={t("screens4_0.settings.connectedAccounts.copyLinkCode")}
              />
            </FlexRow>
            <FlexRow align="center" gap={SPACING.md}>
              <LoadingSpinner />
              <Caption>
                {t("screens4_0.settings.connectedAccounts.waitingForConfirmation", {
                  provider: PROVIDER_LABEL
                })}
              </Caption>
            </FlexRow>
            <FlexRow>
              <EditorButton variant="text" onClick={handleCancel}>
                {t("screens4_0.settings.connectedAccounts.cancel")}
              </EditorButton>
            </FlexRow>
          </FlexColumn>
        )}
      </FlexColumn>
    </Card>
  );
};

export default memo(ConnectedAccountsSettings);
