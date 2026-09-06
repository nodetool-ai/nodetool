# MuAPI nodes for NodeTool

Opt-in nodes that pin MuAPI's video routes explicitly. They are thin wrappers:
the transport lives in `@nodetool-ai/runtime/provider-transport` and is shared
with `MuapiProvider`, so the generic Text to Video and Image to Video nodes,
chat generation, the media inference endpoint, the CLI and the agent media
tools reach the same routes without this pack installed.

## Nodes

- **MuAPI Text to Video** — the `flux-3-text-to-video` route.
- **MuAPI Image to Video** — the `flux-3-image-to-video` route, with the source
  image uploaded first and referenced by URL.

There is no image node: MuAPI marks its FLUX 3 image routes
(`flux-3-text-to-image`, `flux-3-dev`) coming soon, so neither the pack nor
`MuapiProvider.getAvailableImageModels()` offers one yet.

The pack uses the `MUAPI_API_KEY` secret. Create a key at
<https://muapi.ai/access-keys> and add it in NodeTool's provider settings.

Requests are submitted once (never retried — a job-creating POST may already be
billed), polled until terminal, and downloaded through `safeFetch` with
per-redirect URL checks, size limits and media-type validation.

API reference: <https://muapi.ai/docs/api-reference>
