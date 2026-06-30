---
layout: page
title: "Configuration Guide"
description: "Configure NodeTool settings, environment variables, secrets, and storage backends."
---



NodeTool uses a layered configuration system so local development, automated deployments, and production environments can share sensible defaults with minimal duplication. Settings come from environment variables and `.env` files, while secrets are stored encrypted at rest in a local SQLite database (managed via the CLI).

The configuration helpers live in the `@nodetool-ai/config` package (`environment.ts`). They are plain functions — `loadEnvironment()`, `getEnv()`, and `requireEnv()` — there is no `Environment` class and no `settings.yaml`/`secrets.yaml` loading.

![Settings Dialog](assets/screenshots/settings-dialog.png)

## Configuration Layers

`loadEnvironment()` loads `.env` files in this order, with later files overriding earlier ones; **system environment variables always win** over file values:

1. `.env`
2. `.env.<NODE_ENV>`
3. `.env.<NODE_ENV>.local`

`NODE_ENV` defaults to `development` when unset. Use `getEnv("KEY")` to read a value (returns `undefined` when unset) and `requireEnv("KEY")` to read a value that must be present (throws a descriptive error otherwise).

This hierarchy allows committed defaults, per-environment overrides, and developer-specific overrides to co-exist without file conflicts.

## Managing Settings & Secrets

The in-app Settings dialog is the easiest way to manage everything. It has a sidebar with subsections:

| Section | What it covers |
|---------|---------------|
| **General** | Theme, startup behavior, language |
| **Providers** | API keys for OpenAI, Anthropic, Google, etc. |
| **Default Models** | Pick the default LLM, image model, and embedding model |
| **Folders** | Workspace, cache, and asset directories |
| **Secrets** | Encrypted provider tokens and credentials |
| **Remote** | Point the app at a remote NodeTool server |
| **About** | Version and build info |

![Settings Subviews](assets/screenshots/settings-api-keys.png)

From the command line:

- `nodetool settings show [--json]` – print the resolved environment configuration.
- `nodetool secrets list` – list stored secret keys (values are never shown).
- `nodetool secrets store <key>` – store or update a secret (prompts for the value).
- `nodetool secrets get <key>` – print a stored secret value.

Secrets are encrypted and persisted in a local SQLite database, not in YAML files. There is no `nodetool settings edit` command and no `--secrets` option.

## Secret Storage and Master Key

Secrets saved through the CLI are encrypted with AES-256-GCM, using a per-user key derived from the master key via PBKDF2-SHA256 (100,000 iterations). `initMasterKey()` in `@nodetool-ai/security` resolves the master key in this order:

1. `SECRETS_MASTER_KEY` environment variable.
2. AWS Secrets Manager if `AWS_SECRETS_MASTER_KEY_NAME` is set.
3. Local system keyring (macOS Keychain, Windows Credential Manager, or Secret Service via keytar).
4. Generates a new key and persists it to the keyring.

For shared deployments you **must** pre-provision the master key (via `SECRETS_MASTER_KEY` environment variable or AWS Secrets Manager) so every server can decrypt secrets generated locally. On a headless host with no keychain and no provisioned key, master-key initialization (and therefore startup) fails because there is no place to persist a generated key.

### Migrating Secrets to a Server

1. Export the master key once and set it on every server instance using the value from your deployment pipeline or secrets manager:

   ```bash
   export SECRETS_MASTER_KEY="<your-base64-master-key>"
   ```

2. The `nodetool deploy apply` command automatically synchronizes all secrets from your local database to the target server right after a successful deploy. If you ever need to do it manually, POST the encrypted payload to the admin endpoint using the worker bearer token:

   ```bash
   curl -H "Authorization: Bearer $NODETOOL_WORKER_TOKEN" \
        -H "Content-Type: application/json" \
        -X POST https://your-server.example.com/admin/secrets/import \
        --data-binary @secrets-export.json
   ```

   The server stores the ciphertext verbatim, so both sides must share the same master key.

## Storage Backend Selection

The storage backend is selected explicitly by `NODETOOL_STORAGE_BACKEND` (one of `file`, `s3`, or `supabase`; defaults to `file`). It is **not** auto-detected from the presence of S3 or Supabase credentials.

- `file` (default) — assets are written to the local assets directory.
- `s3` — requires `ASSET_BUCKET` (and, for the temp store, `TEMP_BUCKET`); reads `S3_REGION` and `S3_ENDPOINT` as needed.
- `supabase` — requires `SUPABASE_URL`, `SUPABASE_KEY`, and the relevant bucket var.

The asset store uses `ASSET_BUCKET`; the temp store uses `TEMP_BUCKET`. See `storage-config.ts` in `@nodetool-ai/config`.

## Using Environment Variables in Code

When adding a feature that reads configuration:

1. Read the variable with `getEnv("YOUR_ENV_VAR")` from `@nodetool-ai/config` so `.env` load order is respected.
2. If the value is required, use `requireEnv("YOUR_ENV_VAR")` so a missing key raises a descriptive error.
3. Document the new entry in `.env.example`.

## Recommended Workflow

```bash
cp .env.example .env.development.local
vim .env.development.local           # add OpenAI/Anthropic/HF tokens, S3 credentials, etc.

nodetool secrets store OPENAI_API_KEY  # encrypt a provider key into the secrets DB (optional)
nodetool settings show               # verify resolved configuration
```

Use `.env.<env>.local` for machine-specific overrides and keep secrets out of version control. When deploying, provide environment variables via your orchestrator or the `deployment.yaml` `env` section—NodeTool will merge them automatically at runtime.

## Supabase Settings

NodeTool integrates with Supabase for both user authentication and asset storage.

Set the following to enable Supabase:

- `NODETOOL_STORAGE_BACKEND=supabase` – select the Supabase storage backend
- `SUPABASE_URL` – your project URL, e.g. `https://<ref>.supabase.co`
- `SUPABASE_KEY` – a service role key (server-side only)
- `ASSET_BUCKET` – Supabase Storage bucket used for assets (e.g. `assets`)
- `TEMP_BUCKET` – bucket for temporary assets (e.g. `assets-temp`)
- Use a separate Supabase for user-provided nodes:
  - `NODE_SUPABASE_URL` – user/node project URL (kept distinct from core `SUPABASE_URL`)
  - `NODE_SUPABASE_KEY` – service role key for user/node data (kept distinct from core `SUPABASE_KEY`)
  - `NODE_SUPABASE_SCHEMA` – optional schema for node tables (defaults to `public`)
  - `NODE_SUPABASE_TABLE_PREFIX` – optional prefix applied to node tables to avoid collisions with core tables

Behavior:

- Storage is used for Supabase buckets only when `NODETOOL_STORAGE_BACKEND=supabase`; the backend is chosen explicitly, not auto-detected from the presence of credentials.
- Authentication enters Supabase mode (enforced auth) when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set — storage and auth are configured independently. See [Authentication](authentication.md#authentication-modes).

Security notes:

- Use the service role key only in server environments. Do not expose it to clients.
- Public buckets make generated URLs directly accessible. For private buckets, add a signing step.

## Environment Variables Index

![API Settings](assets/screenshots/settings-api-keys.png)

| Variable | Purpose | Secret | Notes |
|----------|---------|--------|-------|
| `NODE_ENV` | Environment name (`development`, `test`, `production`) | no | Defaults to `development`; controls `.env` file load order |
| `SUPABASE_URL` / `SUPABASE_KEY` | Enable Supabase auth mode (both required) | `SUPABASE_KEY` | When both are set, the server enforces auth and validates Supabase JWTs. See [Authentication](authentication.md#authentication-modes) |
| `SERVER_AUTH_TOKEN` | Deploy-tooling bearer token (`@nodetool-ai/deploy`) | yes | Generated automatically if unset; not used by the websocket server's auth mode selection |
| `NODETOOL_TRUST_LOCALHOST` | Allow loopback connections to bypass auth as user `1` | no | Defaults **off** when auth is enforced (Supabase), **on** otherwise. Leave off behind a reverse proxy/SSH tunnel where the proxy connects from loopback. |
| `NODETOOL_TRUSTED_PROXIES` | Reverse proxies whose `X-Forwarded-For` is trusted | no | Comma-separated IPs/CIDRs. When unset, `X-Forwarded-For` is ignored and the socket peer address is used. |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Provider access | yes | Set only the providers you use |
| `HF_TOKEN` / `FAL_API_KEY` / `REPLICATE_API_TOKEN` | HuggingFace-family providers | yes | Optional per workflow |
| `OLLAMA_API_URL` | Local Ollama base URL | no | Default `http://127.0.0.1:11434` |
| `DB_PATH` / `DATABASE_URL` | Database connection | no | Set only one. `DB_PATH` configures SQLite; `DATABASE_URL` supports PostgreSQL (`postgres://`, `postgresql://`) and SQLite (`file:`, `sqlite:`) |
| `NODETOOL_STORAGE_BACKEND` | Storage backend (`file`, `s3`, `supabase`) | no | Default `file`. Selected explicitly — not auto-detected from credentials |
| `S3_*` | S3-compatible storage settings | yes | Includes access keys and region |
| `ASSET_BUCKET` / `TEMP_BUCKET` | Asset and temp buckets (s3 / supabase backends) | no | Use signed URLs for private buckets |
| `NODETOOL_VECTOR_PROVIDER` / `VECTORSTORE_DB_PATH` | Vector store config | no | Default backend is local SQLite-vec; switch to `pinecone` or `supabase` for remote. See [Indexing](indexing.md). |
| `NODE_SUPABASE_URL` / `NODE_SUPABASE_KEY` / `NODE_SUPABASE_SCHEMA` / `NODE_SUPABASE_TABLE_PREFIX` | User/node Supabase config | `NODE_SUPABASE_KEY` | Kept separate from core Supabase credentials and tables |
| `NODETOOL_RATE_LIMIT_DISABLED` | Disable per-IP HTTP rate limiting | no | Limiter is **on** by default; localhost is always exempt |
| `NODETOOL_RATE_LIMIT_MAX` | Max HTTP requests per window per IP | no | Default `1000` |
| `NODETOOL_RATE_LIMIT_WINDOW_MS` | Rate-limit window length (ms) | no | Default `60000` (1 minute) |
| `NODETOOL_RATE_LIMIT_TRUST_PROXY` | Key the limiter by `X-Forwarded-For` (`req.ip`) instead of the socket address | no | Enable **only** behind a trusted proxy that sets the header |
| `NODETOOL_WS_RATE_LIMIT_DISABLED` | Disable the per-connection WebSocket inbound message cap | no | Cap is **on** by default |
| `NODETOOL_WS_RATE_LIMIT_MAX` | Max inbound WS messages per window per connection | no | Default `200`; over-cap clients are closed with code `1008` |
| `NODETOOL_WS_RATE_LIMIT_WINDOW_MS` | WebSocket rate-limit window length (ms) | no | Default `1000` (1 second) |
| `LOG_LEVEL` / `NODETOOL_LOG_LEVEL` | Logging level | no | Defaults to `info` (`NODETOOL_LOG_LEVEL` takes precedence) |
| `SECRETS_MASTER_KEY` / `AWS_SECRETS_MASTER_KEY_NAME` | Master key for secret encryption | yes | See [Secret Storage and Master Key](#secret-storage-and-master-key) |
| `RUNPOD_API_KEY` | RunPod deployments | yes | Used by CLI and providers |
| `NODETOOL_WORKER_TOKEN` | Worker bearer token for admin endpoints | yes | Rotate regularly |

Use `nodetool settings show` to view resolved values and verify the merge order.

## Related Documentation

- [Storage Guide](storage.md) – how asset storage backends are selected.  
- [Deployment Guide](deployment.md) – passing environment variables in `deployment.yaml`.  
- [CLI Reference](cli.md) – settings-related commands.
