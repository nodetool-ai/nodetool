---
layout: page
title: "Configuration Guide"
---



NodeTool reads configuration from layered sources so local development, automated deployments, and production can share defaults with minimal duplication. The configuration helpers live in `src/nodetool/config/settings.py` and `src/nodetool/config/environment.py`.

## Configuration Layers

`Environment.load_settings()` merges values in this order (last wins):

1. **Defaults** – built-in values for SQLite storage, local asset paths, and log levels.
2. **Environment variables** – exported via the shell or process supervisor.
3. **Settings file** – `$HOME/.config/nodetool/settings.yaml`.
4. **Secrets file** – `$HOME/.config/nodetool/secrets.yaml` when populated through the CLI.
5. **`.env` files** – loaded in this order: `.env`, `.env.<ENV>`, `.env.<ENV>.local`.

This hierarchy allows committed defaults, per-environment overrides, and developer-specific secrets to co-exist without file conflicts.

## Managing Settings & Secrets

- `nodetool settings show [--secrets]` – print the current values in a Rich table.
- `nodetool settings edit [--secrets]` – open the YAML file in `$EDITOR`. Files are created on first use.

Settings metadata (description, grouping) is registered via `register_setting()` and `register_secret()` in `src/nodetool/config/settings.py`. New environment variables should be declared there so they automatically appear in CLI tables and `.env.example`.

### File Locations

| Purpose   | Path (`get_system_file_path`) | Notes |
|-----------|-------------------------------|-------|
| Settings  | `~/.config/nodetool/settings.yaml` | Non-sensitive configuration (URLs, paths). |
| Secrets   | `~/.config/nodetool/secrets.yaml` | Optional secure overrides for API keys. |
| Cache     | `~/.cache/nodetool/…` (`get_system_cache_path`) | Generated metadata, package cache. |
| Data      | `~/.local/share/nodetool/…` (`get_system_data_path`) | Persistent application data. |

## Secret Storage and Master Key

Secrets saved through the CLI are encrypted before being written to disk. The master key management logic in `src/nodetool/security/master_key.py` retrieves or creates a key in this order:

1. `SECRETS_MASTER_KEY` environment variable.
2. AWS Secrets Manager if `AWS_SECRETS_MASTER_KEY_NAME` is set.
3. Local system keyring (macOS Keychain, Windows Credential Manager, or Secret Service).
4. Generates a new key and stores it in the keyring (`MasterKeyManager.get_master_key()`).

For shared deployments you **must** pre-provision the master key (via `SECRETS_MASTER_KEY` environment variable or AWS Secrets Manager) so every worker can decrypt secrets generated locally. Worker and API processes will refuse to start in production when the variable is missing.

### Migrating Secrets to a Worker

1. Export the master key once and set it on every worker instance:

   ```bash
   export SECRETS_MASTER_KEY="$(nodetool python -c 'from nodetool.security.master_key import MasterKeyManager; import asyncio; print(asyncio.run(MasterKeyManager.get_master_key()))')"
   ```

   (or copy the value from your deployment pipeline/secrets manager)
2. The `nodetool deploy apply` command automatically synchronizes all secrets from your local database to the target worker right after a successful deploy. If you ever need to do it manually, POST the encrypted payload to the new admin endpoint:

   ```bash
   curl -H "Authorization: Bearer $WORKER_TOKEN" \
        -H "Content-Type: application/json" \
        -X POST https://your-worker.example.com/admin/secrets/import \
        --data-binary @secrets-export.json
   ```

   The worker stores the ciphertext verbatim, so both sides must share the same master key.

## Runtime Environment Detection

`Environment.is_production()` and `Environment.is_test()` determine which services to instantiate:

- Production and any environment with S3 credentials default to S3-backed storage (see `ResourceScope.get_asset_storage()` in `src/nodetool/runtime/resources.py`).
- Tests automatically provision in-memory storage and isolated SQLite databases.
- `ENV` defaults to `development` and can be switched with `Environment.set_env()` or the `ENV` environment variable.

## Registering New Settings

When adding a feature that requires configuration:

1. Register the variable in `src/nodetool/config/settings.py` via `register_setting()` or `register_secret()` to document it and surface it in CLI tables.
2. Update `.env.example` with the new entry.
3. Reference the variable using `Environment.get("YOUR_ENV_VAR")` to respect the hierarchy.
4. If the value is required, supply `default=NOT_GIVEN` (see `get_value()` in `src/nodetool/config/settings.py`) so missing keys raise a descriptive error.

## Recommended Workflow

```bash
cp .env.example .env.development.local
vim .env.development.local       # add OpenAI/Anthropic/HF tokens, S3 credentials, etc.

nodetool settings edit           # tweak non-secret defaults
nodetool settings edit --secrets # encrypt sensitive values (optional)
```

Use `.env.<env>.local` for machine-specific overrides and keep secrets out of version control. When deploying, provide environment variables via your orchestrator or the `deployment.yaml` `env` section—NodeTool will merge them automatically at runtime.

## Supabase Settings

NodeTool integrates with Supabase for both user authentication and asset storage.

Set the following to enable Supabase:

- `SUPABASE_URL` – your project URL, e.g. `https://<ref>.supabase.co`
- `SUPABASE_KEY` – a service role key (server-side only)
- `ASSET_BUCKET` – Supabase Storage bucket used for assets (e.g. `assets`)
- `ASSET_TEMP_BUCKET` – optional bucket for temporary assets (e.g. `assets-temp`)
- Use a separate Supabase for user-provided nodes:
  - `NODE_SUPABASE_URL` – user/node project URL (kept distinct from core `SUPABASE_URL`)
  - `NODE_SUPABASE_KEY` – service role key for user/node data (kept distinct from core `SUPABASE_KEY`)
  - `NODE_SUPABASE_SCHEMA` – optional schema for node tables (defaults to `public`)
  - `NODE_SUPABASE_TABLE_PREFIX` – optional prefix applied to node tables to avoid collisions with core tables

Behavior:

- When `SUPABASE_URL`/`SUPABASE_KEY` are set, `ResourceScope.get_asset_storage()` and `get_temp_storage()` prefer Supabase buckets.
- If not set, NodeTool falls back to S3 (when `S3_*` are provided) or local filesystem.
- Authentication strategy is controlled via `AUTH_PROVIDER` (see [Authentication](authentication.md#authentication-providers)).

Security notes:

- Use the service role key only in worker/server environments. Do not expose it to clients.
- Public buckets make `get_url()` links directly accessible. For private buckets, add a signing step.

## Environment Variables Index

| Variable | Purpose | Secret | Notes |
|----------|---------|--------|-------|
| `ENV` | Environment name (`development`, `test`, `production`) | no | Defaults to `development` |
| `AUTH_PROVIDER` | Auth mode (`none`, `local`, `static`, `supabase`) | no | See [Authentication](authentication.md) |
| `WORKER_AUTH_TOKEN` | Static token for auth | yes | Generated automatically if unset |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Provider access | yes | Set only the providers you use |
| `HF_TOKEN` / `FAL_API_KEY` / `REPLICATE_API_TOKEN` | HuggingFace-family providers | yes | Optional per workflow |
| `OLLAMA_API_URL` | Local Ollama base URL | no | Default `http://127.0.0.1:11434` |
| `DB_PATH` | SQLite path | no | Defaults to `~/.config/nodetool/nodetool.sqlite3` |
| `S3_*` | S3-compatible storage settings | yes | Includes access keys and region |
| `ASSET_BUCKET` / `ASSET_TEMP_BUCKET` | Asset buckets | no | Use signed URLs for private buckets |
| `CHROMA_PATH` / `CHROMA_URL` / `CHROMA_TOKEN` | Vector DB config | `CHROMA_TOKEN` | Path defaults to local share |
| `NODE_SUPABASE_URL` / `NODE_SUPABASE_KEY` / `NODE_SUPABASE_SCHEMA` / `NODE_SUPABASE_TABLE_PREFIX` | User/node Supabase config | `NODE_SUPABASE_KEY` | Kept separate from core Supabase credentials and tables |
| `NODETOOL_ENABLE_TERMINAL_WS` | Opt-in terminal WebSocket | no | Leave unset in production |
| `LOG_LEVEL` | Logging level | no | Defaults to `INFO` |
| `RUNPOD_API_KEY` | RunPod deployments | yes | Used by CLI and providers |
| `PROXY_BEARER_TOKEN` | Protects proxy admin endpoints | yes | Rotate regularly |

Use `nodetool settings show` to view resolved values and verify the merge order.

## Related Documentation

- [Storage Guide](storage.md) – how asset storage backends are selected.  
- [Deployment Guide](deployment.md) – passing environment variables in `deployment.yaml`.  
- [Proxy Reference](proxy.md) – proxy bearer tokens and TLS configuration.  
- [CLI Reference](cli.md) – settings-related commands.
