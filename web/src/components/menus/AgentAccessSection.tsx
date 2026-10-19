/** @jsxImportSource @emotion/react */
/**
 * Connecting an external MCP client to this server.
 *
 * The install buttons next door write config files on the machine the server
 * runs on, which only helps when that machine is the user's own. This section
 * is the other case: Claude Code on a laptop, a NodeTool somewhere else. It
 * answers the two questions that case actually has — what URL, and what
 * credential — and hands over a config block that already contains both.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import type { agentAccess } from "@nodetool-ai/protocol/api-schemas";
import {
  AlertBanner,
  Caption,
  Code,
  CodeBlock,
  CopyButton,
  Dialog,
  FlexColumn,
  FlexRow,
  FormField,
  NavButton,
  SectionHeader,
  SelectField,
  Text,
  TextInput,
  getSpacingPx,
  SPACING,
  LoadingSpinner
} from "../ui_primitives";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

type Connection = agentAccess.McpConnectionOutput;
type TokenSummary = agentAccess.AccessTokenSummary;
type OauthGrant = agentAccess.OauthGrantSummary;

/** Lifetimes the UI offers. "Never" is the default: a token in a config file
 * that silently stops working months later is a bad afternoon. */

/**
 * The URL an external client points at. The server's own answer wins when the
 * operator configured a public address; otherwise this page's origin is used,
 * which is by construction an address that reaches the server.
 */
function resolveMcpUrl(connection: Connection | undefined): string {
  if (connection?.url) return connection.url;
  return `${window.location.origin}/mcp`;
}

/** The `claude mcp add` line, and the JSON block for editors that take one. */
function configSnippets(url: string, token: string | null) {
  const header = token ? ` --header "Authorization: Bearer ${token}"` : "";
  const cli = `claude mcp add --transport http nodetool ${url}${header}`;
  const server: {
    type: string;
    url: string;
    headers?: Record<string, string>;
  } = { type: "http", url };
  if (token) {
    server.headers = { Authorization: `Bearer ${token}` };
  }
  const json = JSON.stringify({ mcpServers: { nodetool: server } }, null, 2);
  return { cli, json };
}

function formatStamp(value: string | null, locale: string, neverLabel: string): string {
  if (!value) return neverLabel;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(locale).format(new Date(parsed));
}

const AgentAccessSection = () => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<string>("never");
  // The plaintext of the token just minted. Held for this render only — the
  // server keeps a hash, so once this is gone it is gone everywhere.
  const [freshToken, setFreshToken] = useState<string | null>(null);
  // The grant pending a revoke confirmation, or null when the dialog is closed.
  const [grantToRevoke, setGrantToRevoke] = useState<OauthGrant | null>(null);

  const { data: connection } = useQuery({
    queryKey: ["mcp-connection"],
    queryFn: () => trpcClient.agentAccess.mcpConnection.query(),
    refetchOnWindowFocus: false
  });

  const { data: tokenList, isLoading: tokensLoading } = useQuery({
    queryKey: ["access-tokens"],
    queryFn: () => trpcClient.agentAccess.listTokens.query(),
    refetchOnWindowFocus: false
  });

  const createToken = useMutation({
    mutationFn: (input: agentAccess.CreateTokenInput) =>
      trpcClient.agentAccess.createToken.mutate(input),
    onSuccess: (result) => {
      setFreshToken(result.token);
      setName("");
      queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
    },
    onError: (err) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_1.agentAccess.createTokenError", { error: String(err) })
      });
    }
  });

  const revokeToken = useMutation({
    mutationFn: (id: string) =>
      trpcClient.agentAccess.revokeToken.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
      addNotification({ type: "info", alert: true, content: t("screens4_1.agentAccess.tokenRevoked") });
    }
  });

  const { data: grantList, isLoading: grantsLoading } = useQuery({
    queryKey: ["oauth-grants"],
    queryFn: () => trpcClient.agentAccess.listOauthGrants.query(),
    refetchOnWindowFocus: false
  });

  const revokeGrant = useMutation({
    mutationFn: (grantId: string) =>
      trpcClient.agentAccess.revokeOauthGrant.mutate({ grant_id: grantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oauth-grants"] });
      addNotification({
        type: "info",
        alert: true,
        content: t("screens4_1.agentAccess.clientDisconnected")
      });
    },
    onError: (err) => {
      addNotification({
        type: "error",
        alert: true,
        content: t("screens4_1.agentAccess.disconnectClientError", { error: String(err) })
      });
    },
    onSettled: () => setGrantToRevoke(null)
  });

  const handleCreate = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createToken.mutate({
      name: trimmed,
      expires_in_days: expiry === "never" ? null : Number(expiry)
    });
  }, [name, expiry, createToken]);

  const url = resolveMcpUrl(connection);
  const tokens = tokenList?.tokens ?? [];
  const grants = grantList?.grants ?? [];
  const snippets = useMemo(
    () => configSnippets(url, freshToken),
    [url, freshToken]
  );
  const expiryOptions = [
    { value: "never", label: t("screens4_1.agentAccess.noExpiry") },
    { value: "30", label: t("screens4_1.agentAccess.days", { count: 30 }) },
    { value: "90", label: t("screens4_1.agentAccess.days", { count: 90 }) },
    { value: "365", label: t("screens4_1.agentAccess.year", { count: 1 }) }
  ];

  return (
    <div className="settings-section" style={{ marginTop: getSpacingPx(SPACING.xxl) }}>
      <SectionHeader size="small" title={t("screens4_1.agentAccess.title")} />
      <Text className="description" sx={{ mb: 1 }}>
          {t("screens4_1.agentAccess.description")}
      </Text>

      {connection && !connection.enabled && (
        <AlertBanner severity="warning" sx={{ mb: 1 }}>
          {t("screens4_1.agentAccess.mcpDisabled", { path: "/mcp" })}{" "}
          <Code>{connection.enable_flag}=1</Code>{" "}{t("screens4_1.agentAccess.mcpDisabledEnd")}
        </AlertBanner>
      )}

      {connection?.auth_mode === "none" && (
        <AlertBanner severity="info" sx={{ mb: 1 }}>
          {t("screens4_1.agentAccess.noAuthWarning")}
        </AlertBanner>
      )}

      <FormField label={t("screens4_1.agentAccess.serverUrl")} sx={{ mb: 2 }}>
        <FlexRow align="center" gap={1}>
          <CodeBlock sx={{ flex: 1 }}>{url}</CodeBlock>
          <CopyButton value={url} tooltip={t("screens4_1.agentAccess.copyServerUrl")} />
        </FlexRow>
      </FormField>

      <FlexRow align="flex-end" gap={SPACING.lg} sx={{ mb: 1 }}>
        <TextInput
          label={t("screens4_1.agentAccess.tokenName")}
          placeholder={t("screens4_1.agentAccess.tokenNamePlaceholder")}
          value={name}
          size="small"
          onChange={(event) => setName(event.target.value)}
        />
        <SelectField
          label={t("screens4_1.agentAccess.expires")}
          value={expiry}
          options={expiryOptions}
          size="small"
          onChange={setExpiry}
        />
        <NavButton
          icon={<AddCircleOutlineIcon />}
          label={t("screens4_1.agentAccess.createToken")}
          color="primary"
          disabled={!name.trim() || createToken.isPending}
          onClick={handleCreate}
          sx={{ padding: `${SPACING.sm}px ${SPACING.xl}px`, whiteSpace: "nowrap" }}
        />
      </FlexRow>

      {freshToken && (
        <FlexColumn gap={1} sx={{ mb: 2 }}>
          <AlertBanner severity="success">
            {t("screens4_1.agentAccess.tokenShownOnce")}
          </AlertBanner>
          <FlexRow align="center" gap={1}>
            <CodeBlock sx={{ flex: 1 }}>{freshToken}</CodeBlock>
            <CopyButton value={freshToken} tooltip={t("screens4_1.agentAccess.copyToken")} />
          </FlexRow>

          <Caption>{t("screens4_1.agentAccess.runInClaudeCode")}</Caption>
          <FlexRow align="center" gap={1}>
            <CodeBlock sx={{ flex: 1 }}>{snippets.cli}</CodeBlock>
            <CopyButton value={snippets.cli} tooltip={t("screens4_1.agentAccess.copyCommand")} />
          </FlexRow>

          <Caption>{t("screens4_1.agentAccess.pasteMcpConfig")}</Caption>
          <FlexRow align="flex-start" gap={1}>
            <CodeBlock sx={{ flex: 1 }}>{snippets.json}</CodeBlock>
            <CopyButton
              value={snippets.json}
              tooltip={t("screens4_1.agentAccess.copyConfiguration")}
            />
          </FlexRow>
        </FlexColumn>
      )}

      {tokensLoading && <LoadingSpinner size="small" text={t("screens4_1.agentAccess.loadingTokens")} />}

      {tokens.length > 0 && (
        <FlexColumn gap={0}>
          <Caption sx={{ mb: 0.5 }}>{t("screens4_1.agentAccess.yourTokens")}</Caption>
          {tokens.map((token: TokenSummary) => (
            <div key={token.id} className="settings-item">
              <FlexRow align="center" justify="space-between" fullWidth>
                <FlexColumn gap={0}>
                  <Text sx={{ fontWeight: 500 }}>{token.name}</Text>
                  <Text className="description">
                    {t("screens4_1.agentAccess.created", { date: formatStamp(token.created_at, i18n.language, t("screens4_1.agentAccess.never")) })} · {t("screens4_1.agentAccess.lastUsed", { date: formatStamp(token.last_used_at, i18n.language, t("screens4_1.agentAccess.never")) })} ·{" "}
                    {token.expires_at
                      ? t("screens4_1.agentAccess.expiresOn", { date: formatStamp(token.expires_at, i18n.language, t("screens4_1.agentAccess.never")) })
                      : t("screens4_1.agentAccess.noExpiry")}
                  </Text>
                </FlexColumn>
                <NavButton
                  icon={<RemoveCircleOutlineIcon />}
                  label={t("screens4_1.agentAccess.revoke")}
                  disabled={revokeToken.isPending}
                  onClick={() => revokeToken.mutate(token.id)}
                  navSize="small"
                  sx={{
                    padding: `${SPACING.xs}px ${SPACING.md}px`,
                    minWidth: "unset",
                    fontSize: theme.fontSizeSmall
                  }}
                />
              </FlexRow>
            </div>
          ))}
        </FlexColumn>
      )}

      <FlexColumn gap={0} sx={{ mt: 2 }}>
        <Caption sx={{ mb: 0.5 }}>{t("screens4_1.agentAccess.connectedClients")}</Caption>
        {grantsLoading && <LoadingSpinner size="small" />}
        {!grantsLoading && grants.length === 0 && (
          <Text className="description">{t("screens4_1.agentAccess.noClients")}</Text>
        )}
        {grants.map((grant: OauthGrant) => (
          <div key={grant.id} className="settings-item">
            <FlexRow align="center" justify="space-between" fullWidth>
              <FlexColumn gap={0}>
                <Text sx={{ fontWeight: 500 }}>{grant.client_name}</Text>
                <Text className="description">
                  {t("screens4_1.agentAccess.connected", { date: formatStamp(grant.created_at, i18n.language, t("screens4_1.agentAccess.never")) })} · {grant.client_id}
                </Text>
              </FlexColumn>
              <NavButton
                icon={<RemoveCircleOutlineIcon />}
                label={t("screens4_1.agentAccess.revoke")}
                disabled={revokeGrant.isPending}
                onClick={() => setGrantToRevoke(grant)}
                navSize="small"
                sx={{
                  padding: `${SPACING.xs}px ${SPACING.md}px`,
                  minWidth: "unset",
                  fontSize: theme.fontSizeSmall
                }}
              />
            </FlexRow>
          </div>
        ))}
      </FlexColumn>

      <Dialog
        open={grantToRevoke !== null}
        onClose={() => setGrantToRevoke(null)}
        title={t("screens4_1.agentAccess.disconnectTitle")}
        confirmText={t("screens4_1.agentAccess.disconnect")}
        destructive
        isLoading={revokeGrant.isPending}
        onConfirm={() => {
          if (grantToRevoke) revokeGrant.mutate(grantToRevoke.id);
        }}
      >
        <Text>
          {t("screens4_1.agentAccess.disconnectConfirmation", { client: grantToRevoke?.client_name ?? "" })}
        </Text>
      </Dialog>
    </div>
  );
};

export default memo(AgentAccessSection);
