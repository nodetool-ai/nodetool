---
layout: page
title: "NodeTool Server Authentication"
description: "Token-based authentication for securing NodeTool server endpoints in development and production."
---

See [API Reference](api-reference.md) for a matrix of endpoints, auth requirements, and streaming behavior. The NodeTool
server uses token-based authentication to secure all endpoints when deployed.
For environment variable defaults and precedence, see the [Configuration Guide](configuration.md#environment-variables-index).

## Quick Start

The running server enforces authentication when it is in **Supabase mode**
(both `SUPABASE_URL` and `SUPABASE_KEY` set). Without those, it runs in
**Local mode**: loopback connections are trusted and run as user `"1"`, while
non-loopback requests are rejected.

```bash
# Start the server (Local mode — loopback trusted)
nodetool serve

# Enable Supabase mode to enforce auth on every request
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-service-role-key
nodetool serve
```

The `SERVER_AUTH_TOKEN` / `deployment.yaml` token described below is generated
and consumed by the `@nodetool-ai/deploy` tooling; see
[Authentication Modes](#authentication-modes) for how the server itself selects
its mode.

---

## How It Works

### Token Generation Priority

The server looks for a token in this order:

1. **Environment variable** `SERVER_AUTH_TOKEN`
1. **Config file** `~/.config/nodetool/deployment.yaml`
1. **Auto-generate** a new token and save it to the config file

### Auto-Generation

On first run, if no token is found:

1. A cryptographically secure 32-byte token is generated (`crypto.randomBytes`)
1. The token is saved to `~/.config/nodetool/deployment.yaml`
1. File permissions are set to `0600` (owner read/write only)
1. The full token is displayed in the console output

### Token Location

**Config file path:**

- Linux/macOS: `~/.config/nodetool/deployment.yaml`
- Windows: `%APPDATA%\nodetool\deployment.yaml`

**File format:**

```yaml
server_auth_token: your-auto-generated-token-here
```

---

## Using the Token

All API requests (except the public health endpoints `/health`, `/ready`, and
`/api/health`) require authentication when the server is running in Supabase
mode — that is, when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set. When
those are not set, the server runs in Local mode and accepts loopback
connections without a token for convenience (see
[Localhost Trust](#localhost-trust-and-reverse-proxies)); non-loopback requests
are rejected with `401`.

When authentication is enforced, send the Supabase JWT in the header:

```bash
# Get token from config file
TOKEN=$(cat ~/.config/nodetool/deployment.yaml | grep server_auth_token | cut -d' ' -f2)

# Use in requests
curl -H "Authorization: Bearer $TOKEN" http://localhost:7777/v1/models
```

### Example Requests

**Chat Completion:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST http://localhost:7777/v1/chat/completions \
  -d '{
    "model": "llama3.2:latest",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

**List Collections:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:7777/admin/collections
```

**Upload File:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  -X PUT http://localhost:7777/admin/storage/assets/image.png \
  --data-binary @image.png
```

---

## Authentication Modes

The running server does **not** read an `AUTH_PROVIDER` variable to choose a
strategy. It selects its mode from the presence of Supabase credentials:

- **Supabase mode** — enabled when **both** `SUPABASE_URL` and `SUPABASE_KEY`
  are set. The server validates a Supabase JWT on every non-public request and
  enforces auth.
- **Local mode** — the default when those are not set. Loopback connections
  bypass auth and run as user `"1"` (gated by `NODETOOL_TRUST_LOCALHOST`);
  non-loopback requests are rejected with `401`.

> `AUTH_PROVIDER` is only written into deployed-container environments by the
> `@nodetool-ai/deploy` tooling. The server itself never branches on it.

To enable Supabase mode:

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-service-role-key
```

Behavior:

- Both HTTP and WebSocket endpoints enforce auth in Supabase mode.
- Clients send `Authorization: Bearer <supabase_jwt>`.
- In Local mode, loopback connections default to user `"1"` and no token is required.

Supabase token verification results are cached in-process. The cache defaults
to a 60-second TTL and at most 2000 entries; these are constructor options on
the provider and are not configurable via environment variables.

> WebSockets use the same `Authorization` header semantics as HTTP when auth is enforced. A `?api_key=<token>` query parameter is also accepted as a fallback for WebSocket connections.

---

## Architecture

The authentication system is split across two packages:

- **`@nodetool-ai/auth`** -- defines the abstract **AuthProvider** base class, token extraction from HTTP and WebSocket headers, and the `AuthResult` / `TokenType` types.
- **`@nodetool-ai/deploy`** -- provides the concrete token management functions: `getServerAuthToken()`, `generateSecureToken()`, `verifyServerToken()`, and config file I/O.

```ts
// @nodetool-ai/auth
abstract class AuthProvider {
  extractTokenFromHeaders(headers: Record<string, string> | Headers): string | null;
  extractTokenFromWs(headers, queryParams?): string | null;
  abstract verifyToken(token: string): Promise<AuthResult>;
}

// @nodetool-ai/deploy
function getServerAuthToken(): string;       // resolve token (env → config → generate)
function generateSecureToken(): string;       // crypto.randomBytes(32).toString("base64url")
function verifyServerToken(auth: string): Promise<"authenticated">;  // timing-safe compare
function loadAuthConfig(): Record<string, unknown>;
function saveAuthConfig(config: Record<string, unknown>): void;
```

Token verification uses `crypto.timingSafeEqual` to prevent timing attacks.

> Note: `@nodetool-ai/auth` also ships a `StaticTokenProvider` that reads
> `STATIC_AUTH_TOKEN` / `STATIC_AUTH_TOKENS`. This is a distinct mechanism from
> the deploy-package `SERVER_AUTH_TOKEN` flow, and the `StaticTokenProvider` is
> **not** wired into the running websocket server — the server uses only the
> Supabase / Local selection described in [Authentication Modes](#authentication-modes).

---

## Environment Variable Override

You can override the auto-generated token by setting the environment variable:

```bash
# Set your own token
export SERVER_AUTH_TOKEN="my-custom-secure-token"

# Start server (will use this token instead)
nodetool serve
```

This is useful for:

- Docker deployments with secrets
- CI/CD pipelines
- Multiple server instances with shared token

---

## Docker Deployment

### Using Auto-Generated Token

**Mount the config directory as a volume:**

```bash
docker run -v ~/.config/nodetool:/root/.config/nodetool \
  -p 7777:7777 \
  nodetool-server
```

The token persists across container restarts.

### Using Environment Variable

```bash
# Generate token
TOKEN=$(openssl rand -base64 32)

# Run with token
docker run -e SERVER_AUTH_TOKEN="$TOKEN" \
  -p 7777:7777 \
  nodetool-server
```

### Docker Compose

```yaml
version: '3.8'
services:
  server:
    image: nodetool-server
    ports:
      - "7777:7777"
    volumes:
      # Mount config to persist token
      - ./config:/root/.config/nodetool
    # OR use environment variable
    environment:
      - SERVER_AUTH_TOKEN=${SERVER_AUTH_TOKEN}
```

---

## Retrieving Your Token

### From Console Output

The full token is displayed when the server starts:

```
======================================================================
AUTHENTICATION
======================================================================
Status: ENABLED (all endpoints require authentication)
Token: abc12345...xyz9
Source: Auto-generated and saved to /home/user/.config/nodetool/deployment.yaml

   Authorization: Bearer abc12345-full-token-here-xyz9
======================================================================
```

### From Config File

```bash
# Linux/macOS
cat ~/.config/nodetool/deployment.yaml

# Windows PowerShell
Get-Content $env:APPDATA\nodetool\deployment.yaml
```

### Programmatically

```ts
import { getServerAuthToken, getTokenSource } from "@nodetool-ai/deploy";

const token = getServerAuthToken();
const source = getTokenSource();  // "environment" | "config" | "generated"
console.log(`Token (${source}): ${token}`);
```

---

## Security Best Practices

### 1. Protect the Config File

The config file contains your authentication token. It's automatically set to `0600` permissions, but ensure it's not:

- Committed to version control
- Shared publicly
- Accessible by other users

```bash
# Verify permissions (should be -rw-------)
ls -la ~/.config/nodetool/deployment.yaml

# Fix if needed
chmod 600 ~/.config/nodetool/deployment.yaml
```

### 2. Rotate Tokens Regularly

```bash
# Delete the config file
rm ~/.config/nodetool/deployment.yaml

# Restart server (new token will be generated)
nodetool serve
```

Or set a new environment variable:

```bash
export SERVER_AUTH_TOKEN="$(openssl rand -base64 32)"
```

### 3. Use Different Tokens per Environment

```bash
# Development
export SERVER_AUTH_TOKEN="dev-token"

# Staging
export SERVER_AUTH_TOKEN="staging-token"

# Production
export SERVER_AUTH_TOKEN="$(openssl rand -base64 32)"
```

### 4. Use HTTPS in Production

Always deploy with TLS/SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:7777;
    }
}
```

---

## Public Endpoints

These endpoints do **not** require authentication:

- `GET /health` - Health check
- `GET /ready` - Readiness check
- `GET /api/health` - API health check

This allows load balancers and monitoring systems to check service status without authentication.

---

## Error Responses

### 401 Unauthorized

In Supabase mode, requests without a valid token receive a `401` with an
`error` field:

**Missing token:**

```json
{
  "error": "Unauthorized"
}
```

**Invalid / rejected token:**

```json
{
  "error": "<reason from the auth provider>"
}
```

**Non-loopback request when running in Local mode:**

```json
{
  "error": "Remote access requires authentication"
}
```

---

## Troubleshooting

### Token Not Working

```bash
# Start server and check token source in output
nodetool serve
# Look for "Source: ..." in the output

# Verify token in config
cat ~/.config/nodetool/deployment.yaml

# Check environment variable
echo $SERVER_AUTH_TOKEN
```

### Can't Find Config File

```bash
# Check default location
ls -la ~/.config/nodetool/

# Create directory if missing
mkdir -p ~/.config/nodetool

# Restart server to generate token
nodetool serve
```

### Token Not Persisting (Docker)

```bash
# Mount config directory as volume
docker run -v nodetool-config:/root/.config/nodetool \
  -p 7777:7777 \
  nodetool-server

# Or use environment variable
docker run -e SERVER_AUTH_TOKEN="your-token" \
  -p 7777:7777 \
  nodetool-server
```

---

## API Client Examples

### TypeScript / JavaScript

```ts
const TOKEN = "your-token-here";
const BASE_URL = "http://localhost:7777";

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

// List models
const models = await fetch(`${BASE_URL}/v1/models`, { headers });
console.log(await models.json());

// Chat completion
const chat = await fetch(`${BASE_URL}/v1/chat/completions`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    model: "llama3.2:latest",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});
console.log(await chat.json());
```

### Python

```python
import requests

TOKEN = "your-token-here"
BASE_URL = "http://localhost:7777"

headers = {"Authorization": f"Bearer {TOKEN}"}

# List models
response = requests.get(f"{BASE_URL}/v1/models", headers=headers)
print(response.json())

# Chat completion
response = requests.post(
    f"{BASE_URL}/v1/chat/completions",
    headers={**headers, "Content-Type": "application/json"},
    json={
        "model": "llama3.2:latest",
        "messages": [{"role": "user", "content": "Hello!"}]
    }
)
print(response.json())
```

### Shell Script

```bash
#!/bin/bash

TOKEN=$(cat ~/.config/nodetool/deployment.yaml | grep server_auth_token | awk '{print $2}')
BASE_URL="http://localhost:7777"

# List models
curl -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/v1/models"

# Chat completion
curl -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "$BASE_URL/v1/chat/completions" \
  -d '{
    "model": "llama3.2:latest",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## Advanced Configuration

### Custom Config Location

```ts
import { loadAuthConfig, saveAuthConfig, generateSecureToken } from "@nodetool-ai/deploy";

// Load current config
const config = loadAuthConfig();

// Generate and save a new token
config["server_auth_token"] = generateSecureToken();
saveAuthConfig(config);
```

---

## Localhost Trust and Reverse Proxies

By default the server bypasses authentication for connections from loopback
(`127.0.0.1`/`::1`) and runs them as user `1`. This is convenient for the
desktop app and local development, but **dangerous behind a reverse proxy,
container network, or SSH tunnel**, where the proxy itself connects from
loopback — a blanket bypass would silently disable auth in exactly the
deployment that needs it.

To make this safe:

- The loopback bypass is gated by `NODETOOL_TRUST_LOCALHOST`. It defaults
  **off** whenever auth is enforced (Supabase mode) and **on** otherwise. Set
  it explicitly (`true`/`false`) to override.
- `X-Forwarded-For` is trusted only for proxies listed in
  `NODETOOL_TRUSTED_PROXIES` (comma-separated IPs/CIDRs). When unset, the
  header is ignored and the unspoofable socket peer address is used to identify
  the client, so a remote client cannot forge a loopback origin.

```bash
# Behind an nginx reverse proxy on the same host, enforcing Supabase auth:
export SUPABASE_URL=... SUPABASE_KEY=...
export NODETOOL_TRUSTED_PROXIES=127.0.0.1   # trust the local proxy's XFF
# NODETOOL_TRUST_LOCALHOST stays off — clients must present a valid token.
```

### Local mode in Docker

Docker NATs a published-port connection to the bridge gateway (e.g.
`172.17.0.1`), so in Local mode the request never arrives from loopback and the
`NODETOOL_TRUST_LOCALHOST` bypass can't fire — the UI loads (static assets and
`/api/config` are public) but every API/WebSocket call returns
`401 "Remote access requires authentication"`.

`NODETOOL_TRUST_LOCAL_NETWORKS` (comma-separated source CIDRs) restores the
single-local-user model by trusting those sources as user `"1"` without a token.
It is honored **only in Local mode** — in Supabase mode it is ignored so every
request must present a valid token.

> ### ⚠️ This bypasses authentication
>
> Every source IP in `NODETOOL_TRUST_LOCAL_NETWORKS` is trusted as **admin user
> `"1"` with no password** — full access to your workflows, files, stored
> secrets, and API keys. **Anyone who can reach the published port from a listed
> range gets that access.**
>
> - **`172.16.0.0/12`** — the Docker bridge range. Host and LAN clients reach the
>   app through the port mapping, but nothing off the bridge is trusted. Use this.
> - **`0.0.0.0/0`** — trusts *every* source, the whole internet if the port is
>   reachable. **Never use this on a public IP.** Only on a network you fully
>   control (private LAN / VPN), ideally with the port firewalled.
> - Exposing NodeTool to the internet or untrusted users? **Do not widen this
>   list — enable Supabase auth** so every request needs a real login.

```bash
# Docker self-host, single user, no login (safe on a private LAN):
NODETOOL_TRUST_LOCAL_NETWORKS=172.16.0.0/12   # the Docker bridge range
```

## Security Hardening

- Production: enable Supabase mode by setting `SUPABASE_URL` and `SUPABASE_KEY`, terminate TLS in front of all non-public endpoints, and rotate Supabase service-role keys via your secrets manager.
- Localhost trust: keep `NODETOOL_TRUST_LOCALHOST` off in any reverse-proxied or containerized deployment, and list only your real proxies in `NODETOOL_TRUSTED_PROXIES`.
- Staging: keep asset buckets private or signed, and run workflows in subprocess or Docker isolation.
- Development: restrict Local mode to isolated machines and avoid storing real secrets in `.env.development`.

See [Security Hardening](security-hardening.md) for detailed checklists across dev, staging, and production.
