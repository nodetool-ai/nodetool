---
layout: page
title: "NodeTool Server Authentication"
description: "Token-based authentication for securing NodeTool server endpoints in development and production."
---

See [API Reference](api-reference.md) for a matrix of endpoints, auth requirements, and streaming behavior. The NodeTool
server uses token-based authentication to secure all endpoints when deployed.
For environment variable defaults and precedence, see the [Configuration Guide](configuration.md#environment-variables-index).

## Quick Start

**Authentication is enabled by default!** The server automatically generates a secure token on first run.

```bash
# Start the server
nodetool serve

# The token is automatically generated and displayed
# Copy it from the console output to use with requests
```

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

All API requests (except `/health` and `/ping`) require authentication when
`AUTH_PROVIDER` is `static` or `supabase`. In local development (default
`ENV=development` and `AUTH_PROVIDER=local`) the server accepts
requests without a token for convenience.

When authentication is enforced, send the static token in the header:

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

## Authentication Providers

Choose the auth strategy via `AUTH_PROVIDER`:

```bash
# Valid values:
#  none      - no authentication; requests run as user "1"
#  local     - development convenience; requests run as user "1"
#  static    - pre-shared token only (server token)
#  supabase  - validate Supabase JWTs

export AUTH_PROVIDER=supabase
```

Supabase configuration (when `AUTH_PROVIDER=supabase`):

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_KEY=your-service-role-key
```

Behavior:

- HTTP and WebSocket endpoints enforce auth when `AUTH_PROVIDER` is `static` or `supabase`.
- With `supabase`, clients send `Authorization: Bearer <supabase_jwt>`. Static server tokens also work for admin endpoints where applicable.
- With `local` or `none`, endpoints do not enforce auth and default to user `"1"`.

Caching (Supabase):

```bash
# Optional tuning (fallback to REMOTE_AUTH_* keys for compatibility)
export AUTH_CACHE_TTL=30     # seconds (0 disables caching)
export AUTH_CACHE_MAX=1000   # cache size
```

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
- `GET /ping` - Ping check

This allows load balancers and monitoring systems to check service status without authentication.

---

## Error Responses

### 401 Unauthorized

**Missing Authorization header:**

```json
{
  "detail": "Authorization header required. Use 'Authorization: Bearer YOUR_TOKEN'"
}
```

**Invalid format:**

```json
{
  "detail": "Invalid authorization header format. Use 'Authorization: Bearer YOUR_TOKEN'"
}
```

**Wrong token:**

```json
{
  "detail": "Invalid authentication token"
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

## Security Hardening

- Production: set `AUTH_PROVIDER` to `supabase` or `static`, terminate TLS in front of all non-public endpoints, and rotate server/proxy tokens via your secrets manager.
- Staging: disable terminal WebSocket (`NODETOOL_ENABLE_TERMINAL_WS` unset), keep asset buckets private or signed, and run workflows in subprocess or Docker isolation.
- Development: keep `AUTH_PROVIDER=local` to isolated machines only and avoid storing real secrets in `.env.development`.

See [Security Hardening](security-hardening.md) for detailed checklists across dev, staging, and production.
