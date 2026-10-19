/** @jsxImportSource @emotion/react */
/**
 * `/oauth/consent?request_id=…` — the page an MCP client's browser flow lands
 * on after `GET /oauth/authorize` parks the pending request server-side. It
 * shows who is asking (client_name), where they redirect to (the host, not
 * the full URI — the spec's own consent requirement), and the scope, then
 * lets the signed-in user approve or deny. Both actions resolve to a redirect
 * URL the SPA navigates the browser to; this page never builds one itself.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import {
  AlertBanner,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  NavButton,
  SPACING,
  PageHeader,
  Text,
  EmptyState
} from "../ui_primitives";
import { trpcClient } from "../../trpc/client";
import { navigateToRedirect } from "./navigate";

const OAuthConsentPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("request_id") ?? "";

  const {
    data: request,
    isLoading,
    isError: loadError
  } = useQuery({
    queryKey: ["oauth-request", requestId],
    queryFn: () =>
      trpcClient.agentAccess.getOauthRequest.query({ request_id: requestId }),
    enabled: requestId.length > 0,
    retry: false
  });

  const approve = useMutation({
    mutationFn: () =>
      trpcClient.agentAccess.approveOauthRequest.mutate({
        request_id: requestId
      }),
    onSuccess: (result) => navigateToRedirect(result.redirect_url)
  });

  const deny = useMutation({
    mutationFn: () =>
      trpcClient.agentAccess.denyOauthRequest.mutate({
        request_id: requestId
      }),
    onSuccess: (result) => navigateToRedirect(result.redirect_url)
  });

  const handleApprove = useCallback(() => approve.mutate(), [approve]);
  const handleDeny = useCallback(() => deny.mutate(), [deny]);

  const busy = approve.isPending || deny.isPending;
  const mutationError = approve.error ?? deny.error;

  if (!requestId) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ minHeight: "60vh", padding: `${SPACING.xl}px` }}
      >
        <EmptyState
          variant="no-data"
          title={t("screen_settings.oauth.noRequestTitle")}
          description={t("screen_settings.oauth.noRequestDescription")}
        />
      </FlexColumn>
    );
  }

  if (isLoading) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ minHeight: "60vh", padding: `${SPACING.xl}px` }}
      >
        <LoadingSpinner size="large" />
      </FlexColumn>
    );
  }

  if (loadError || !request) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ minHeight: "60vh", padding: `${SPACING.xl}px` }}
      >
        <FlexColumn
          gap={2}
          align="center"
          sx={{ maxWidth: "480px", textAlign: "center" }}
        >
          <Text sx={{ fontWeight: 500 }}>
            {t("screen_settings.oauth.expiredTitle")}
          </Text>
          <Text className="description">
            {t("screen_settings.oauth.expiredDescription")}
          </Text>
        </FlexColumn>
      </FlexColumn>
    );
  }

  return (
    <FlexColumn
      align="center"
      justify="center"
      sx={{ minHeight: "60vh", padding: `${SPACING.xl}px` }}
    >
      <FlexColumn gap={2} sx={{ width: "100%", maxWidth: "480px" }}>
        <PageHeader
          variant="plain"
          title={request.client_name}
          subtitle={t("screen_settings.oauth.connectSubtitle")}
        />

        <FlexColumn gap={1} sx={{ mt: 1 }}>
          <FlexRow justify="space-between">
            <Text className="description">
              {t("screen_settings.oauth.redirectsTo")}
            </Text>
            <Text>{request.redirect_host}</Text>
          </FlexRow>
          <FlexRow justify="space-between">
            <Text className="description">
              {t("screen_settings.oauth.access")}
            </Text>
            <Text>{request.scope}</Text>
          </FlexRow>
        </FlexColumn>

        {request.loopback_only && (
          <AlertBanner severity="warning">
            {t("screen_settings.oauth.localhostWarning")}
          </AlertBanner>
        )}

        {mutationError && (
          <AlertBanner severity="error">
            {mutationError instanceof Error
              ? mutationError.message
              : t("screen_settings.oauth.requestFailed")}
          </AlertBanner>
        )}

        <FlexRow gap={1} justify="flex-end" sx={{ mt: 1 }}>
          <NavButton
            icon={<CloseIcon />}
            label={t("screen_settings.oauth.deny")}
            disabled={busy}
            onClick={handleDeny}
            sx={{ padding: `${SPACING.sm}px ${SPACING.xl}px` }}
          />
          <NavButton
            icon={<CheckIcon />}
            label={t("screen_settings.oauth.approve")}
            color="primary"
            disabled={busy}
            onClick={handleApprove}
            sx={{ padding: `${SPACING.sm}px ${SPACING.xl}px` }}
          />
        </FlexRow>
      </FlexColumn>
    </FlexColumn>
  );
};

export default OAuthConsentPage;
