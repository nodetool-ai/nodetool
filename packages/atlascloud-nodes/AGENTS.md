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
- **A mixed reference array is `wrapInto`, not one untyped list.** Wan 3.0 and
  MiniMax H3 reference-to-video take a single `refers: [{url, type}]` covering
  images, videos and audio. The manifest splits that into typed
  `reference_images` / `reference_videos` / `reference_audios` inputs, each
  carrying `"wrapInto": "refers"`; the factory appends their resolved URLs into
  one array in field order and tags each entry with the kind its input
  declared. The wire name is never a node property — the runtime provider reads
  the same flag so its generic `imageToVideo` posts `refers`, not
  `reference_images`. Seedance 2.5 keeps the per-kind names because its API
  really does take three arrays.
- **Don't expose an API option that yields an extra output** the single-output
  node can't surface (the `return_last_frame` Seedance option was dropped).
  The same rule keeps whole models out: `pickOutputUrl` returns the first
  output, so `bytedance/seedream-v5.0-pro/layer-decomposition` — whose point is
  the *set* of layers it returns — is deliberately not shipped. A model that
  returns N interchangeable variants (`n`, `num_images`) is fine; one whose
  outputs are not interchangeable is not.
- **The manifest is generated, not hand-edited.** `node
  scripts/sync-atlascloud-manifest.mjs` reconciles every entry's fields against
  the `Input` schema AtlasCloud publishes for that model (reachable from the
  unauthenticated catalog at `GET /api/v1/models`); `--check` reports drift
  without writing. Hand-tuned enums, wrong separators (`1024x1024` vs
  `1024*1024`) and stale option lists are what the script exists to prevent. Add
  a *model* by hand — the script only maintains the fields of models we ship.
- **Chat is not a node concern.** AtlasCloud's LLMs are OpenAI-compatible at
  `https://api.atlascloud.ai/v1` and are served by `AtlasCloudProvider` in
  `packages/runtime`, which extends `OpenAICompatProvider`. Only the async
  prediction API (image/video) lives in this package.
