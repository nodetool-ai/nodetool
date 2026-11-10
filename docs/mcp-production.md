# MCP on a production server

NodeTool serves MCP over streamable HTTP at `/mcp`. A client configured like this reaches the agent toolbelt (workflows, assets, nodes, collections, jobs):

```json
{
  "mcpServers": {
    "nodetool": {
      "type": "http",
      "url": "https://your-server/mcp",
      "headers": { "Authorization": "Bearer ntk_…" }
    }
  }
}
```

Check it with a real tool call. This `initialize` request returns `200` and an `mcp-session-id` header when the mount and token work:

```bash
curl -i -X POST https://your-server/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ntk_…" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"probe","version":"1"}}}'
```

On a server, two decisions come first: whether to serve the endpoint at all, and how an agent proves who it is. For the surrounding deployment, see [Self-hosted deployment](self-hosted-deployment.md).

## 1. Turn the mount on

The published image, `fly.toml`, and `docker-compose.yml` set `NODETOOL_ENV=production`, and `/mcp` is off in that mode. A deployment opts in, because the endpoint carries the full toolbelt for the user it binds. In a compose file:

```yaml
environment:
  NODETOOL_ENABLE_MCP: "1"
```

Without it the route is never registered. `/mcp` answers 404 for everyone, and the boot log names the flag:

```
MCP over HTTP (/mcp) disabled in production; set NODETOOL_ENABLE_MCP=1 to enable
```

The mount sits behind the same auth hook as `/api` and binds the user that hook resolved. A request it cannot authenticate is refused at initialize with 401, never given an anonymous session. The session id in the `mcp-session-id` header belongs to its owner: a second user presenting an id another user holds gets `404 Session not found`.

Sessions live in the process that opened them. When a request names a session this process does not hold (another replica opened it, a deploy restarted the server, or it was closed as idle or over the per-user cap), the mount opens a new session under the same id for the authenticated caller. The client keeps working without reconnecting. Only in-process state, such as uncommitted graph edits queued by earlier actions, is lost. `GET /mcp` answers `405`: there is no standalone SSE stream, and every result comes back in the `POST` response.

## 2. Connect a client

### The browser path: OAuth

With `NODETOOL_PUBLIC_URL` set, `/mcp` answers an MCP client's discovery flow instead of a bare 401. Point a client (Claude Desktop, Claude Code, VS Code, ChatGPT connectors) at `https://your-server/mcp`. It discovers the authorization server, opens a browser, and you approve. No token to copy.

```
1. Client: POST /mcp (no token)
2. Server: 401, WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"
3. Client discovers the AS metadata, opens a browser to /oauth/authorize
4. You sign in (if not already) and approve the client in the consent page
5. Server redirects back to the client with an authorization code
6. Client exchanges the code for an access token and connects
```

The flow mints an `nta_…` access token scoped to `/mcp` only. It does not authenticate `/api` or `/trpc`, unlike a pasted `ntk_` token. It expires in an hour and refreshes itself. Revoking the grant in **Settings → MCP → Connected clients** kills both the access and refresh token immediately.

`NODETOOL_PUBLIC_URL` is required because the server names its own `/mcp` resource and authorization endpoints in the discovery documents. Without it clients fall back to token paste. The URL must be HTTPS, or loopback (`http://127.0.0.1`, `http://localhost`) for local development. With a plain-HTTP public URL the flow stays off and `/mcp` answers the plain 401. `NODETOOL_DISABLE_MCP_OAUTH=1` turns off the discovery and authorization-server surface (no challenge header, the OAuth routes 404). See [MCP OAuth design](mcp-oauth-design.md) for the protocol.

### Connect claude.ai

claude.ai, Claude Desktop, Claude mobile and Cowork connect through the OAuth path. The server needs both variables:

```yaml
environment:
  NODETOOL_ENABLE_MCP: "1"
  NODETOOL_PUBLIC_URL: "https://your-server"
```

Then, in Claude, open **Settings → Connectors → Add custom connector**, enter `https://your-server/mcp`, and leave the OAuth client ID and secret empty. Claude opens NodeTool's consent page. Sign in there if needed, then approve.

When the web app runs on its own origin, set `NODETOOL_WEB_URL` to that origin, such as `https://app.example.com`. `/oauth/authorize` then sends the browser to the consent page there, where the user's session lives. Unset, the consent page opens on `NODETOOL_PUBLIC_URL`. A user who must sign in there returns to wherever sign-in lands, usually the web app's start page, and the consent step is lost.

- **The URL must be exact.** Claude compares the URL you enter with the
  `resource` in `/.well-known/oauth-protected-resource/mcp`, which is
  `NODETOOL_PUBLIC_URL` plus `/mcp`. A trailing slash or a different host
  fails the connection.
- **No registration call.** The authorization server metadata advertises
  `client_id_metadata_document_supported` and the `none` auth method, so
  Claude identifies itself with the document at
  `https://claude.ai/oauth/mcp-oauth-client-metadata` and redirects to
  `https://claude.ai/api/mcp/auth_callback`. The server fetches that document
  through `safeFetch`. Clients without one still register through
  `/oauth/register`.
- **Claude Code** uses `https://claude.ai/oauth/claude-code-client-metadata`,
  which lists `http://localhost/callback` and `http://127.0.0.1/callback`.
  Claude Code redirects to an ephemeral port, and a loopback redirect matches
  on any port.
- **Anthropic's servers make the calls.** Discovery, the token exchange,
  refreshes and every `/mcp` request come from `160.79.104.0/21`, not from
  the user's browser. A firewall must admit that range. Per-IP rate limits
  (`NODETOOL_RATE_LIMIT_MAX` globally, 30 requests a minute on
  `/oauth/token`) count every Claude user behind one Anthropic address
  together.

Before adding the connector, check that discovery is on:

```bash
curl -i https://your-server/.well-known/oauth-authorization-server
```

`404` with `{"error":"not_found"}` means the flow is off: `NODETOOL_PUBLIC_URL`
is unset or not HTTPS, `NODETOOL_ENABLE_MCP` is unset, or
`NODETOOL_DISABLE_MCP_OAUTH=1`.

### The fallback path: paste a token

Open **Settings → MCP → Connect an agent remotely**. Name a token and pick a lifetime. The app returns a `claude mcp add …` command and the JSON block shown at the top, with the URL and token filled in.

```bash
claude mcp add --transport http nodetool https://your-server/mcp \
  --header "Authorization: Bearer ntk_…"
```

What that token is:

- Bearer credential for the user who minted it. It authenticates the whole API, not only `/mcp`, with that user's access.
- Shown once. The server stores a SHA-256 of the secret half, so a lost token cannot be recovered. Revoke it and mint again.
- Revocable immediately. Revoking deletes the row, and the next request on that token is refused. Delegated tokens used by a messaging bridge are stateless HMACs that live until they expire.
- Optionally expiring. The list shows each token's last use.

Tokens work in every auth mode, including local. When exposing `/mcp` beyond loopback, prefer OAuth if the client supports it: its token reaches `/mcp` alone, so a leaked one cannot reach the rest of the API.

### The other paths

- **A Supabase access token.** With `SUPABASE_URL` and `SUPABASE_KEY` set, the server accepts a Supabase JWT as the bearer token. It suits a script that already signs in. A config file is a poor fit, because the JWT expires within the hour and nothing refreshes it there.
- **Network trust.** In local mode (no identity provider configured), `NODETOOL_TRUST_LOCAL_NETWORKS=<cidr>` trusts that range as user `1` with no token. Scope it to a VPN: anything in the range gets the whole toolbelt, and there is nothing to revoke.
- **A delegated token.** A bot or bridge holding `NODETOOL_INTEGRATION_TOKEN` mints a short-lived token per connection through the integration routes, for a bridge acting on behalf of a linked account.

## 3. If it fails

The probe above answers `200` with an `mcp-session-id` header on success. An `nta_` token works in place of `ntk_…`. Other answers:

| Answer | Cause |
|---|---|
| `404` | The mount is off. Set `NODETOOL_ENABLE_MCP=1` and restart. |
| `401` | No token, or one that is wrong, revoked, or expired. `WWW-Authenticate` with `error="invalid_token"` means an `nta_` token failed; without an `error` param, either no token was sent or a non-OAuth token (`ntk_`, Supabase) was refused. No header at all means the OAuth flow is not configured on this server. |
| `404` on a request that carries a session id | That session belongs to another user, or the id is not 1 to 128 visible ASCII characters. Initialize a new one. |

## What stays local

The **Install on this machine** buttons in the same settings panel write MCP config files into `~/.claude.json` and similar. They are disabled in production (`mcpConfig` answers 503). Use the remote paths above.

## Python nodes

The published image ships no Python worker, so `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1` alone changes only the error. See
[Self-hosted deployment › Python nodes](self-hosted-deployment.md#python-nodes--nodetool_allow_python_bridge_in_production1).
