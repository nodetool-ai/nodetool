# Minimal execution server

Install `@nodetool-ai/server-minimal` and run `nodetool-server-minimal`.
Set `SECRETS_MASTER_KEY` to a secret of at least 32 characters and
`NODETOOL_TOKENS` to a JSON object mapping bearer tokens of at least 32
characters to user IDs. `NODETOOL_DATA_DIR` selects the SQLite and assets
folder. `HOST` and `PORT` select the listening address.

The server exposes authenticated workflow, asset, secret and job routes and
MsgPack execution over `/ws`. Save `OPENAI_API_KEY` through the authenticated
secrets route before using remote text nodes. `OPENAI_BASE_URL` selects a public
HTTPS OpenAI-compatible endpoint. Binary assets are stored without decoding.

Use `createMinimalServer` for programmatic composition. Features are explicitly
configured with `{ id, load }` entries and activate against the execution host.
The executable accepts `NODETOOL_FEATURES` as comma-separated
`feature-id=installed-package` entries. Packages must already be installed by
an administrator. Startup rejects incompatible or missing prerequisites and
retains the cause when loading fails.

Optional modules install separately:

- `@nodetool-ai/server-feature-sandbox` enables the Code node in QuickJS.
- `@nodetool-ai/feature-documents` enables PDF text extraction.
- `@nodetool-ai/provider-anthropic` supplies an Anthropic text adapter.
- `@nodetool-ai/database-postgres` supplies a PostgreSQL repository adapter.

The full server retains its existing installed node packs. The minimal host
advertises unavailable nodes without changing their stored documents. It does
not install features while serving.

From the repository, run `npm run build:packages` before
`npm run test:minimal:packed`. The latter packs runtime dependencies and installs
them outside the workspace with normal install scripts. Its report includes
logical installed bytes, external package instances, budget results and the
number of JavaScript and declaration files inspected by the dependency guard.
Measure the default CLI separately:

```bash
node scripts/minimal-packed-consumer.mjs @nodetool-ai/cli /tmp/nodetool-cli
```

Each consumer directory contains its own `measurement.json`. To compare with a
previously measured installation, pass `--baseline-report <measurement.json>`.
Do not substitute an unmeasured collection of optional command features for a
clean-install baseline.

Registered execution nodes receive a local `workspace` scoped to authenticated
user and run. User and job IDs are hashed into directory segments under
`NODETOOL_DATA_DIR/workspaces`, and files survive restarts. File access uses the
shared workspace traversal and symlink checks.

Programmatic hosts can pass `repository` to `createMinimalServer` instead of
using SQLite. For example, explicitly install `@nodetool-ai/database-postgres`,
call `await createPostgresRepository(url)`, and pass the result. The minimal
package does not depend on PostgreSQL. The server takes ownership of the
repository and awaits its close on shutdown or startup failure. Assets and
workspaces still use the configured local directory.
