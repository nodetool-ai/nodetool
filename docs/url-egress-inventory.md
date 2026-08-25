# URL egress inventory

Where NodeTool's server can be told to open an outbound request, who tells it,
and what decides whether it may.

A URL that reaches this process is rarely typed by the person who owns the
machine. It rides in on a media ref inside a workflow, in a provider's result
body, on a chat client's attachment, or straight out of a model that read
someone else's web page a moment ago. A bare `fetch(uri)` on any of those is
the server making a request on a stranger's behalf from inside the perimeter,
which is how `http://169.254.169.254/latest/meta-data/` gets read.

The machine-readable list is
`packages/runtime/tests/url-egress-inventory.ts`; the audit that keeps it honest
is `url-egress-audit.test.ts` beside it. Run both with
`npm run test --workspace=packages/runtime -- url-egress`.

## The policy

**Default:** https, to a host that is not a loopback, link-local, RFC1918,
CGNAT or benchmarking address — and every redirect hop re-checked.
`safeFetch` in `packages/runtime/src/providers/safe-url.ts` is that policy as a
function, and it is the only thing that counts as protection. `isSafePublicHttpsUrl`
and friends are predicates: a predicate can refuse an initial URL, but a public
host that answers `302 Location: http://127.0.0.1:6379/` walks past one.

**Media refs** go through `fetchExternalMedia`
(`packages/runtime/src/external-media-fetch.ts`), which is `safeFetch` plus one
documented opt-out (below).

**The sandbox fetch bridge** runs its own policy on purpose: plain http is
allowed, and a host — never guest code — may waive the address check for a node
that replaces a trusted `lib.http` node. It reads the same address table.

### One address table

`isBlockedIpLiteral` in `providers/safe-url.ts` decides which literals are
internal. It covers IPv4 (loopback, 0.0.0.0/8, RFC1918, 169.254/16, CGNAT,
198.18/15), the alternate spellings the WHATWG parser normalizes for us
(decimal, hex, octal, short form), IPv6 loopback/unspecified/ULA/link-local, and
the IPv6 forms that carry an IPv4 inside them — IPv4-mapped, IPv4-compatible,
6to4, NAT64.

Four tables existed before: this one, the sandbox's in
`packages/agents/src/network-guard.ts` (which now imports it), a private copy
inside `unified-websocket-runner.ts` (deleted — it allowed http and screened
only the first URL), and `isSafeHttpUrl` in `together-nodes` /
`atlascloud-nodes`, which survive as local predicates in front of a protected
fetch. The audit fails if a private copy comes back.

### DNS rebinding

**Decision: not defended in-process; the deployment's egress control is the
boundary.** A name that passes the address check can resolve to a private
address a millisecond later, and this process does not choose the address
`fetch` connects to — pinning one means resolving ourselves and dialing an IP
with a `Host` header, which breaks TLS verification and virtual hosting for
every provider CDN we download from.

One exception, and it earns the round trip: when the URL is handed to a
*separate process* that opens its own sockets, `assertResolvedHostAllowed`
(`packages/agents/src/network-guard.ts`) resolves the name and refuses a
blocked answer first. `yt_dlp` is the surface that uses it.

Every inventory entry records which of the two it is, in `dnsRebinding`. An
entry that claims `resolve-and-check` must call the resolver.

### The self-hosted opt-out

`NODETOOL_ALLOW_PRIVATE_MEDIA_FETCH=1` turns the guard off for media-ref
fetches — and for nothing else. It exists for an install that genuinely serves
media off its own LAN (`http://nas.local/clip.mp4`). It is read per call, so it
takes effect without a restart, and it is off by default. See
[configuration.md](configuration.md).

## Guarded surfaces

Everything here fetches a URL somebody else chose, through the protected fetch.

| Surface | File | URL comes from |
|---|---|---|
| media ref → bytes (Python bridge + TS nodes) | `packages/runtime/src/media-ref-bytes.ts` | workflow |
| AudioRef → bytes | `packages/audio-nodes/src/lib/audio-wav.ts` | workflow |
| Model3DRef / ImageRef → bytes | `packages/video-nodes/src/nodes/model3d/utils.ts` | workflow |
| `nodetool.model3d.RenderToImage` | `packages/video-nodes/src/nodes/model3d/render.ts` | workflow |
| chat source images + output auto-save | `packages/websocket/src/unified-websocket-runner.ts` | chat client |
| asset ref → bytes on export | `packages/websocket/src/lib/asset-export.ts` | chat client |
| `save_asset` / `view_image` | `packages/agents/src/capabilities/assets.ts` | model |
| `yt_dlp` download | `packages/agents/src/capabilities/media.ts` | model |
| Apify run artifacts → assets | `packages/agents/src/apify/assets.ts` | provider response |
| Reve reference image | `packages/reve-nodes/src/reve-base.ts` | workflow |
| HF pipeline media input | `packages/huggingface-nodes/src/huggingface-base.ts` | workflow |
| FAL media upload | `packages/fal-nodes/src/fal-base.ts` | workflow |
| Replicate files upload | `packages/replicate-nodes/src/replicate-base.ts` | workflow |
| OpenAI media input | `packages/llm-nodes/src/nodes/openai.ts` | workflow |
| Together asset resolution | `packages/together-nodes/src/together-base.ts` | workflow |
| AtlasCloud media pass-through | `packages/atlascloud-nodes/src/atlascloud-factory.ts` | workflow |
| KIE result downloads | `packages/kie-nodes/src/kie-base.ts` | provider response |
| Topaz result downloads | `packages/topaz-nodes/src/topaz-base.ts` | provider response |
| MiniMax audio / file downloads | `packages/minimax-nodes/src/minimax-base.ts` | provider response |
| MiniMax image download | `packages/minimax-nodes/src/nodes/text-to-image.ts` | provider response |
| Gemini node video download | `packages/llm-nodes/src/nodes/gemini.ts` | provider response |
| provider result downloads | `packages/runtime/src/providers/{fal,replicate,kie,topaz,meshy,rodin,minimax,evolink,gemini,anthropic}-provider.ts` | provider response |
| MCP OAuth Client ID Metadata Document fetch | `packages/websocket/src/oauth/cimd.ts` | model/client (an MCP client's self-hosted `client_id` URL) |

The provider row is ten files, each downloading a URL a provider's response
named:

- `packages/runtime/src/providers/fal-provider.ts`
- `packages/runtime/src/providers/replicate-provider.ts`
- `packages/runtime/src/providers/kie-provider.ts`
- `packages/runtime/src/providers/topaz-provider.ts`
- `packages/runtime/src/providers/meshy-provider.ts`
- `packages/runtime/src/providers/rodin-provider.ts`
- `packages/runtime/src/providers/minimax-provider.ts`
- `packages/runtime/src/providers/evolink-provider.ts`
- `packages/runtime/src/providers/gemini-provider.ts`
- `packages/runtime/src/providers/anthropic-provider.ts`

Screening code itself: `packages/runtime/src/providers/safe-url.ts`,
`packages/runtime/src/external-media-fetch.ts`,
`packages/agents/src/network-guard.ts`, `packages/agents/src/apify/policy.ts`.
The guest bridge is `packages/agents/src/js-sandbox.ts`.

## Exemptions

**Fixed provider hosts (43 files).** The URL is a constant in this repo, at most
with a path or query interpolated — `api.elevenlabs.io`, `fal.run`,
`generativelanguage.googleapis.com`, the OAuth token endpoints, the codegen
schema fetchers. Screening them would refuse nothing and would break an
install whose configured endpoint is deliberately internal. They carry the
provider's own credential, so the rule that matters for them is the opposite
one: a URL that is *not* fixed must not inherit that credential. Each is listed
in the data module with its auth scope.

**Deliberately private hosts.** Reaching an internal address is the feature:

- `packages/runtime/src/comfy-executor.ts` — a ComfyUI server, normally
  localhost or the LAN, so screening private addresses would refuse the ordinary
  case. The address is the node's `endpoint` property, so the graph author picks
  it, and `lib.comfy.RunWorkflow` / `lib.comfy.RunWorkflowOnWorker` are
  allowlisted on the cloud profile.
- `packages/agents/src/capabilities/web.ts` — `BROWSER_URL`, the operator's
  screenshot service. Every model-named URL in that file goes through
  `safeFetch`; this one is the operator's own.
- `packages/cli/src/nodetool.ts` — runs on the operator's machine against their
  own API URL, loopback by default.
- `packages/deploy/src/admin-client.ts` — the server being deployed.
- `packages/node-sdk/src/package-registry-client.ts` — the pack registry,
  overridable for a self-hosted one.

**Browser-side.** The socket belongs to the viewer's browser, not the server:
`packages/image-nodes/src/nodes/image-io.ts` (behind `!IS_NODE`),
`packages/core-nodes/src/nodes/fake-media.ts`,
`packages/automation-nodes/src/lib/browser-capture.ts` (inside `page.evaluate`).

## Adding a surface

When a change lets a new URL reach `fetch`, answer these in the PR and add the
row to `url-egress-inventory.ts` — the audit fails without it:

1. **Input source.** Who picks the URL: a model, a workflow, a chat client, a
   provider's response, or a constant in this repo? Anything but the last is
   caller data.
2. **Egress target.** Does this process open the socket, or does a browser, a
   subprocess, or the provider? Only the first is our SSRF.
3. **Authorization.** What credential rides along, and would it leak on a
   cross-origin redirect? `safeFetch` strips `Authorization`, `Cookie`,
   `Proxy-Authorization` and `X-Goog-Api-Key` when the origin changes.
4. **Redirects.** Who checks each hop? If the answer is "the runtime follows
   them", the URL had better be fixed.
5. **CSP.** If the fetched bytes end up rendered in the web app, check
   `web/src/__tests__/contentSecurityPolicy.test.ts` — a new media origin needs
   a `connect-src`/`img-src` entry, and stored media renders through
   `ResponsiveImage` / `VideoPlayer` / `AudioPlayback`, never a raw locator.
6. **DNS rebinding.** `deployment-egress` unless the URL leaves this process
   for another one, in which case resolve and check.
