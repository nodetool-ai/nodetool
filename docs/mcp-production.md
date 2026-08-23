# MCP on a production server

NodeTool speaks MCP over streamable HTTP at `/mcp`. An MCP client — Claude
Code, Claude Desktop, Codex, anything else — reaches that endpoint and gets the
agent toolbelt: workflows, assets, nodes, collections, jobs.

On a laptop this needs no setup. On a server it needs two decisions: whether to
serve the endpoint at all, and how an agent proves who it is. This page covers
both. For the surrounding deployment, see
[Self-hosted deployment](self-hosted-deployment.md).

## 1. Turn the mount on

The published image, `fly.toml`, and `docker-compose.yml` all set
`NODETOOL_ENV=production`, and `/mcp` is off in that mode. The endpoint carries
the full toolbelt for whichever user it binds, so a deployment opts in. The
NodeTool production deploy does it in `fly.toml`'s `[env]`; a compose file does
it the same way:

```yaml
environment:
  NODETOOL_ENABLE_MCP: "1"
```

Without it the route is never registered — `/mcp` answers 404 for everyone,
authenticated or not — and the boot log names the flag:

```
MCP over HTTP (/mcp) disabled in production; set NODETOOL_ENABLE_MCP=1 to enable
```

The mount is not a second door. It sits behind the same auth hook as `/api`,
and binds the user that hook resolved. A request it cannot authenticate is
refused at initialize with 401, never given an anonymous session. The session
id in the `mcp-session-id` header belongs to its owner: a second user
presenting the same id gets `404 Session not found`, the same answer as an id
that never existed.

## 2. Connect a client

### The browser path: OAuth

With `NODETOOL_PUBLIC_URL` set, `/mcp` answers a spec-conforming MCP client's
discovery flow instead of a bare 401. Every spec-conforming client — Claude
Desktop, Claude Code, VS Code, ChatGPT connectors — already speaks it: point
the client at `https://your-server/mcp`, it discovers the authorization
server, opens a browser, and you approve. No token to copy.

```
1. Client: POST /mcp (no token)
2. Server: 401, WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"
3. Client discovers the AS metadata, opens a browser to /oauth/authorize
4. You sign in (if not already) and approve the client in the consent page
5. Server redirects back to the client with an authorization code
6. Client exchanges the code for an access token and connects
```

What gets minted is an `nta_…` access token, scoped to `/mcp` only — it does
not authenticate `/api`, `/trpc`, or anything else, unlike a pasted `ntk_`
token (below). It expires in an hour and refreshes itself; revoking the grant
in **Settings → MCP → Connected clients** kills both the access and refresh
token immediately.

`NODETOOL_PUBLIC_URL` is required because the server has to name its own
`/mcp` resource and authorization endpoints in the discovery documents it
serves — without it, the flow cannot start and clients fall back to token
paste. `NODETOOL_DISABLE_MCP_OAUTH=1` turns the whole discovery + AS surface
off (no challenge header, the OAuth routes 404) for an operator who wants
token-paste as the only path. See
[MCP OAuth design](mcp-oauth-design.md) for the full protocol.

### The fallback path: paste a token

Open **Settings → MCP → Connect an agent remotely**. Name a token, pick a
lifetime, and the app hands back a `claude mcp add …` command and a JSON block
with the URL and the token already in them.

```bash
claude mcp add --transport http nodetool https://your-server/mcp \
  --header "Authorization: Bearer ntk_…"
```

Or, for a client that takes a config file:

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

What that token is:

- **A bearer credential for one user**, the one who minted it. It authenticates
  the whole API, not only `/mcp`, and carries exactly that user's access — no
  more and no less than their browser session.
- **Shown once.** The server stores a SHA-256 of the secret half and nothing
  else, so the plaintext exists only in the response that minted it. Lose it
  and you revoke and mint again; there is no recovery.
- **Revocable, immediately.** Revoking deletes the row, and the next request on
  that token is refused. This is the difference from the delegated tokens a
  messaging bridge uses, which are stateless HMACs that live until they expire.
- **Optionally expiring.** A lifetime is offered but not required; the list
  shows each token's last use, so a forgotten one is visible before you revoke
  it.

Tokens work in every auth mode, including local, and reach every route — not
only `/mcp`. A self-hoster exposing `/mcp` beyond loopback should still prefer
the OAuth path above when the client supports it: the token it mints is
scoped to `/mcp` alone, so a leaked one cannot reach the rest of the API.

### The other paths

- **A Supabase access token.** With `SUPABASE_URL` and `SUPABASE_KEY` set, the
  server accepts a Supabase JWT as the bearer token, like any web client. Fine
  for a script that already signs in; a poor fit for a config file, since the
  JWT expires within the hour and nothing refreshes it there.
- **Network trust.** In local mode (no identity provider configured),
  `NODETOOL_TRUST_LOCAL_NETWORKS=<cidr>` trusts that range as user `1` with no
  token at all. Scope it to a VPN: anything reaching the server from a trusted
  range gets the whole toolbelt, and there is nothing to revoke afterwards.
- **A delegated token.** A bot or bridge holding `NODETOOL_INTEGRATION_TOKEN`
  mints a short-lived token per connection through the integration routes. This
  is for a bridge acting on behalf of a linked account, not for a person
  configuring a client.

## 3. Check it

From the machine the agent runs on:

```bash
curl -i -X POST https://your-server/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ntk_…" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"probe","version":"1"}}}'
```

A working setup answers `200` with an `mcp-session-id` header. An `nta_` token
from the OAuth flow works the same way in place of `ntk_…`. What the other
answers mean:

| Answer | Cause |
|---|---|
| `404` | The mount is off. Set `NODETOOL_ENABLE_MCP=1` and restart. |
| `401` | No token, or one that is wrong, revoked, or expired. Check `WWW-Authenticate` for `error="invalid_token"` versus no error at all (no token sent). |
| `404` on a request that carries a session id | That session belongs to another user. Initialize a new one. |

## What stays local

The **Install on this machine** buttons in the same settings panel write MCP
config files into `~/.claude.json` and friends. They are disabled in production
(`mcpConfig` answers 503) because on a shared host those files belong to
nobody. The remote paths above are what works there.

## Python nodes

A separate flag, and a separate gotcha: the published image ships no Python
worker, so `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1` alone changes nothing
but the error. See
[Self-hosted deployment › Python nodes](self-hosted-deployment.md#python-nodes--nodetool_allow_python_bridge_in_production1).
