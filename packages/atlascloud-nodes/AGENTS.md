# atlascloud-nodes — AtlasCloud API Wrapper

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **atlascloud-nodes**

> Read [packages/AGENTS.md § External-API Wrapper Nodes](../AGENTS.md#external-api-wrapper-nodes) first — those billing/SSRF/poll/retry rules are the bulk of what matters here. This overlay notes the AtlasCloud specifics.

`atlascloud-base.ts` holds the **hardened SSRF reference** for the monorepo:
`isPrivateOrLocalHost` normalizes a host to numeric octets via full `inet_aton`
semantics (decimal/hex/octal + short forms), unwraps IPv4-mapped IPv6, blocks
`localhost`/`*.localhost`, and is tested against the decimal metadata IP
`2852039166` (169.254.169.254). Other wrapper packages should adopt it.

Package specifics from shipped fixes:

- **Download billed results through `atlasDownload` (`fetchWithRetry`)**, not a
  plain `fetch` — a transient 429/5xx on the CDN otherwise discards an
  already-billed result.
- **Latent gap to respect**: `fetchWithRetry` here does **not** yet distinguish
  idempotent methods, so do **not** route job-creating `POST`s through a retrying
  path — a 5xx after the server billed would double-submit. (See the `topaz-nodes`
  `IDEMPOTENT_METHODS` pattern.)
- **Recognize all terminal poll states** via the `SUCCESS_STATUS` /
  `FAILURE_STATUS` synonym sets (`complete`/`done`/`succeeded`, `canceled`) — an
  unrecognized terminal status must not poll to timeout.
- **`guessMime` reads both `mime_type` and `mimeType`** — prompt @-mention
  injection (`InjectedAssetRef`) uses camelCase; don't rely on extension sniffing
  for extension-less / `asset://` URIs.
- **Model multi-image inputs as `list[image]`**, not a single `image` with
  `array: true`.
- **Don't expose an API option that yields an extra output** the single-output
  node can't surface (the `return_last_frame` Seedance option was dropped).
