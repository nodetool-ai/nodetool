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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import type { agentAccess } from "@nodetool-ai/protocol/api-schemas";
import {
  AlertBanner,
  Caption,
  CopyButton,
  Dialog,
  FlexColumn,
  FlexRow,
  NavButton,
  SelectField,
  Text,
  TextInput,
  BORDER_RADIUS,
  getSpacingPx,
  SPACING
} from "../ui_primitives";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";

type Connection = agentAccess.McpConnectionOutput;
type TokenSummary = agentAccess.AccessTokenSummary;
type OauthGrant = agentAccess.OauthGrantSummary;

/** Lifetimes the UI offers. "Never" is the default: a token in a config file
 * that silently stops working months later is a bad afternoon. */
const EXPIRY_OPTIONS = [
  { value: "never", label: "No expiry" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" }
] as const;

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

function formatStamp(value: string | null): string {
  if (!value) return "never";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

const AgentAccessSection = () => {
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
        content: `Could not create the token: ${err}`
      });
    }
  });

  const revokeToken = useMutation({
    mutationFn: (id: string) =>
      trpcClient.agentAccess.revokeToken.mutate({ id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-tokens"] });
      addNotification({ type: "info", alert: true, content: "Token revoked" });
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
        content: "Client disconnected"
      });
    },
    onError: (err) => {
      addNotification({
        type: "error",
        alert: true,
        content: `Could not disconnect the client: ${err}`
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

  const codeBox = {
    fontFamily: "monospace",
    fontSize: theme.fontSizeSmall,
    background: theme.palette.background.default,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: BORDER_RADIUS.sm,
    padding: getSpacingPx(SPACING.sm),
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-all" as const,
    overflowX: "auto" as const
  };

  return (
    <div className="settings-section" style={{ marginTop: "1.5em" }}>
      <Text sx={{ fontWeight: 500, mb: 0.5 }}>Connect an agent remotely</Text>
      <Text className="description" sx={{ mb: 1 }}>
        Point Claude Code, Claude Desktop, or any MCP client at this server over
        HTTP. Create a token below and paste the configuration it produces.
      </Text>

      {connection && !connection.enabled && (
        <AlertBanner severity="warning" sx={{ mb: 1 }}>
          This server does not serve <code>/mcp</code>. Set{" "}
          <code>{connection.enable_flag}=1</code> in its environment and restart
          it.
        </AlertBanner>
      )}

      {connection?.auth_mode === "none" && (
        <AlertBanner severity="info" sx={{ mb: 1 }}>
          This server checks no credential — it trusts its own network. A token
          still works and is the safer choice if you reach it from anywhere but
          this machine.
        </AlertBanner>
      )}

      <FlexColumn gap={1} sx={{ mb: 2 }}>
        <Caption>Server URL</Caption>
        <FlexRow align="center" gap={1}>
          <div css={codeBox} style={{ flex: 1 }}>
            {url}
          </div>
          <CopyButton value={url} tooltip="Copy the server URL" />
        </FlexRow>
      </FlexColumn>

      <FlexRow align="flex-end" gap={1} sx={{ mb: 1 }}>
        <TextInput
          label="Token name"
          placeholder="Claude Code on my laptop"
          value={name}
          size="small"
          onChange={(event) => setName(event.target.value)}
        />
        <SelectField
          label="Expires"
          value={expiry}
          options={EXPIRY_OPTIONS}
          size="small"
          onChange={setExpiry}
        />
        <NavButton
          icon={<AddCircleOutlineIcon />}
          label="Create token"
          color="primary"
          disabled={!name.trim() || createToken.isPending}
          onClick={handleCreate}
          sx={{ padding: "0.4em 1.5em", whiteSpace: "nowrap" }}
        />
      </FlexRow>

      {freshToken && (
        <FlexColumn gap={1} sx={{ mb: 2 }}>
          <AlertBanner severity="success">
            Copy this now — it is shown once and cannot be retrieved again.
          </AlertBanner>
          <FlexRow align="center" gap={1}>
            <div css={codeBox} style={{ flex: 1 }}>
              {freshToken}
            </div>
            <CopyButton value={freshToken} tooltip="Copy the token" />
          </FlexRow>

          <Caption>Claude Code — run this</Caption>
          <FlexRow align="center" gap={1}>
            <div css={codeBox} style={{ flex: 1 }}>
              {snippets.cli}
            </div>
            <CopyButton value={snippets.cli} tooltip="Copy the command" />
          </FlexRow>

          <Caption>Or paste into an MCP client config file</Caption>
          <FlexRow align="flex-start" gap={1}>
            <div css={codeBox} style={{ flex: 1 }}>
              {snippets.json}
            </div>
            <CopyButton
              value={snippets.json}
              tooltip="Copy the configuration"
            />
          </FlexRow>
        </FlexColumn>
      )}

      {tokensLoading && <Text sx={{ padding: "1em" }}>Loading tokens…</Text>}

      {tokens.length > 0 && (
        <FlexColumn gap={0}>
          <Caption sx={{ mb: 0.5 }}>Your tokens</Caption>
          {tokens.map((token: TokenSummary) => (
            <div key={token.id} className="settings-item">
              <FlexRow align="center" justify="space-between" fullWidth>
                <FlexColumn gap={0}>
                  <Text sx={{ fontWeight: 500 }}>{token.name}</Text>
                  <Text
                    className="description"
                    sx={{ fontSize: "var(--fontSizeSmall) !important" }}
                  >
                    Created {formatStamp(token.created_at)} · Last used{" "}
                    {formatStamp(token.last_used_at)} ·{" "}
                    {token.expires_at
                      ? `Expires ${formatStamp(token.expires_at)}`
                      : "No expiry"}
                  </Text>
                </FlexColumn>
                <NavButton
                  icon={<RemoveCircleOutlineIcon />}
                  label="Revoke"
                  disabled={revokeToken.isPending}
                  onClick={() => revokeToken.mutate(token.id)}
                  navSize="small"
                  sx={{
                    padding: "0.25em 1em",
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
        <Caption sx={{ mb: 0.5 }}>Connected MCP clients</Caption>
        {grantsLoading && <Text sx={{ padding: "1em" }}>Loading…</Text>}
        {!grantsLoading && grants.length === 0 && (
          <Text className="description">No MCP client has connected yet.</Text>
        )}
        {grants.map((grant: OauthGrant) => (
          <div key={grant.id} className="settings-item">
            <FlexRow align="center" justify="space-between" fullWidth>
              <FlexColumn gap={0}>
                <Text sx={{ fontWeight: 500 }}>{grant.client_name}</Text>
                <Text
                  className="description"
                  sx={{ fontSize: "var(--fontSizeSmall) !important" }}
                >
                  Connected {formatStamp(grant.created_at)} · {grant.client_id}
                </Text>
              </FlexColumn>
              <NavButton
                icon={<RemoveCircleOutlineIcon />}
                label="Revoke"
                disabled={revokeGrant.isPending}
                onClick={() => setGrantToRevoke(grant)}
                navSize="small"
                sx={{
                  padding: "0.25em 1em",
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
        title="Disconnect this client?"
        showActions
        confirmText="Disconnect"
        cancelText="Cancel"
        isLoading={revokeGrant.isPending}
        onCancel={() => setGrantToRevoke(null)}
        onConfirm={() => {
          if (grantToRevoke) revokeGrant.mutate(grantToRevoke.id);
        }}
      >
        <Text>
          {grantToRevoke?.client_name} will no longer be able to reach this
          server. It will need to reconnect and be approved again.
        </Text>
      </Dialog>
    </div>
  );
};

export default memo(AgentAccessSection);
