# Scripts

Utility scripts used during development and release.

- `changelog.py` – generates the CHANGELOG from git history
- `release.py` – bumps version numbers and builds release artifacts
- `release/` – helper scripts invoked by CI during publishing
- `compact-memory.py` – compacts OpenCode memory files to prevent context bloat

These scripts are typically executed manually by maintainers.

## start-production.sh

Starts the NodeTool API server in production using pm2 for process management (auto-restart, log rotation, memory limits).

**Prerequisites:**
- Node.js and npm
- pm2 (`npm install -g pm2`)
- Built packages (`npm run build --workspaces --if-present`)
- TLS certs: set `TLS_CERT`/`TLS_KEY` environment variables, or place `cert.pem` and `key.pem` in the repo root

**Usage:**

```bash
# Start or restart the server (default: https://0.0.0.0:8443)
./scripts/start-production.sh

# Custom port
PORT=9443 ./scripts/start-production.sh

# Stop
./scripts/start-production.sh stop

# View logs
./scripts/start-production.sh logs

# Process status
./scripts/start-production.sh status

# Persist across reboots (run once)
pm2 startup
pm2 save
```

**Features:**
- HTTPS/WSS with CloudFlare Origin SSL certs (auto-discovered)
- Auto-restart on crash with exponential backoff
- 2 GB memory limit with automatic restart
- Works with CloudFlare proxy on port 8443

## compact-memory.py

Compacts the memory files in `.memory/` to keep them manageable and prevent context window bloating.

**Usage:**

```bash
# Dry run (see what would be changed)
python scripts/compact-memory.py --dry-run

# Compact memory files
python scripts/compact-memory.py

# Compact with custom age limit (remove entries older than 90 days)
python scripts/compact-memory.py --max-age-days 90

# Help
python scripts/compact-memory.py --help
```

**What it does:**

1. Removes duplicate entries (same content in different locations)
2. Filters out old entries (older than specified days, default 180)
3. Cleans up excessive whitespace
4. Maintains proper formatting

**When to run:**

- After updating memory files following OpenCode workflow completion
- Manually when memory files grow too large (>15KB)
- As part of scheduled maintenance

**OpenCode workflows automatically prompt to run this after updating memory files.**
