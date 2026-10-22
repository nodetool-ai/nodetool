# Antigravity CLI

Downloads the official Unix CLI into `getNodetoolDataDir()/bin/antigravity/agy`
(default `~/.local/share/nodetool/bin/antigravity/agy` on macOS and Linux).
Uses the platform manifest and verifies SHA-512 before publishing the executable.
Requires `tar` for archived releases. Supports macOS and Linux on x64 and arm64,
including musl Linux, plus Android manifest selection.

Install from **Settings → Models & providers → Antigravity** in a local
NodeTool instance, or from a checkout:

```bash
npm run build:packages
npm run install:cli --workspace=@nodetool-ai/antigravity-cli
```

Run the printed executable path in a terminal to sign in. The runtime provider
prefers this executable and falls back to a system `agy` when absent.

The package exports `installAntigravity({ signal })`, `getAntigravityBinaryPath()`,
and `resolveAntigravityCommand()`. Installation skips an existing executable.
It does not run the downloaded binary or change shell profiles. The CLI may
self-update when run. Installation has a five-minute timeout and supports cancellation.

Release source: [Google's installer](https://antigravity.google/cli/install.sh).
