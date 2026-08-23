/** @jsxImportSource @emotion/react */
/**
 * `/oauth/consent?request_id=…` — the page an MCP client's browser flow lands
 * on after `GET /oauth/authorize` parks the pending request server-side. It
 * shows who is asking (client_name), where they redirect to (the host, not
 * the full URI — the spec's own consent requirement), and the scope, then
 * lets the signed-in user approve or deny. Both actions resolve to a redirect
 * URL the SPA navigates the browser to; this page never builds one itself.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import {
  AlertBanner,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  NavButton,
  SPACING,
  Text
} from "../ui_primitives";
import { trpcClient } from "../../trpc/client";
import { navigateToRedirect } from "./navigate";

const OAuthConsentPage = () => {
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

  const containerStyle = useMemo(
    () => ({
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      padding: `${SPACING.xl}px`
    }),
    []
  );

  if (!requestId) {
    return (
      <div style={containerStyle}>
        <FlexColumn
          gap={2}
          align="center"
          sx={{ maxWidth: "480px", textAlign: "center" }}
        >
          <Text sx={{ fontWeight: 500 }}>No authorization request</Text>
          <Text className="description">
            This page needs a request_id. Restart the connection from your
            MCP client.
          </Text>
        </FlexColumn>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (loadError || !request) {
    return (
      <div style={containerStyle}>
        <FlexColumn
          gap={2}
          align="center"
          sx={{ maxWidth: "480px", textAlign: "center" }}
        >
          <Text sx={{ fontWeight: 500 }}>
            Request expired or already handled
          </Text>
          <Text className="description">
            This authorization request is no longer valid. Restart the
            connection from your MCP client.
          </Text>
        </FlexColumn>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <FlexColumn gap={2} sx={{ width: "100%", maxWidth: "480px" }}>
        <Text sx={{ fontWeight: 500, fontSize: "1.2em" }}>
          {request.client_name}
        </Text>
        <Text className="description">
          wants to connect to your NodeTool account.
        </Text>

        <FlexColumn gap={1} sx={{ mt: 1 }}>
          <FlexRow justify="space-between">
            <Text className="description">Redirects to</Text>
            <Text>{request.redirect_host}</Text>
          </FlexRow>
          <FlexRow justify="space-between">
            <Text className="description">Access</Text>
            <Text>{request.scope}</Text>
          </FlexRow>
        </FlexColumn>

        {request.loopback_only && (
          <AlertBanner severity="warning">
            This client only redirects to localhost. Make sure you started
            this connection yourself.
          </AlertBanner>
        )}

        {mutationError && (
          <AlertBanner severity="error">
            {mutationError instanceof Error
              ? mutationError.message
              : "Could not complete this request."}
          </AlertBanner>
        )}

        <FlexRow gap={1} justify="flex-end" sx={{ mt: 1 }}>
          <NavButton
            icon={<CloseIcon />}
            label="Deny"
            disabled={busy}
            onClick={handleDeny}
            sx={{ padding: "0.4em 1.5em" }}
          />
          <NavButton
            icon={<CheckIcon />}
            label="Approve"
            color="primary"
            disabled={busy}
            onClick={handleApprove}
            sx={{ padding: "0.4em 1.5em" }}
          />
        </FlexRow>
      </FlexColumn>
    </div>
  );
};

export default OAuthConsentPage;
