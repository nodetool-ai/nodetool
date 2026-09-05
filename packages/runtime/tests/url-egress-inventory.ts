/**
 * Every place NodeTool's server can be told to open an outbound HTTP request,
 * and what decides whether it may.
 *
 * A URL that reaches this process is rarely typed by the person who owns the
 * machine. It arrives on a media ref inside a workflow, in a provider's result
 * body, from a chat client's attachment, or straight out of a model that read
 * an attacker's web page a moment ago. `fetch(uri)` on any of those is the
 * server making a request on a stranger's behalf from inside the perimeter,
 * which is how `169.254.169.254` gets read.
 *
 * Five different address tables existed when this file was written — one in
 * `providers/safe-url.ts`, one in the sandbox's `network-guard.ts`, a private
 * copy inside `websocket-client-session.ts`, and two more in node packs — plus
 * a dozen sites with no check at all. The consolidation is recorded in
 * `docs/url-egress-inventory.md`; this is the list it is kept honest against.
 *
 * The audit that reads it is `url-egress-audit.test.ts`. It discovers URL
 * surfaces mechanically from source, in both directions: a plain `fetch(<var>)`
 * that no entry classifies fails, and so does a `guarded` entry whose file has
 * grown one back.
 */

/** What decides the URL, and therefore how much it can be trusted. */
export type UrlInputSource =
  /** A model chose it, so a web page it read can have chosen it. */
  | "model"
  /** It rode in on a graph, a media ref, or a run parameter. */
  | "workflow"
  /** A chat client attached or pasted it. */
  | "chat-client"
  /** A provider's response body named it (a result CDN, a poll target). */
  | "provider-response"
  /** The operator configured it — an env var, a CLI flag, a settings row. */
  | "operator"
  /** A constant in this repo, at most with path/query interpolation. */
  | "fixed"
  /** Not a URL surface: prose, or an injectable seam. */
  | "none";

/**
 * What the file's *plain* `fetch` calls are, which is what the audit's scan
 * sees. A file can carry a protected fetch as well — that is `guardedBy`.
 */
export type EgressPolicy =
  /** Every caller-provided URL here goes through a protected fetch. */
  | "guarded"
  /** Addresses a service host built from a constant in this repo. */
  | "fixed-host"
  /** Deliberately reaches an operator-named host, private ranges included. */
  | "private-integration"
  /** Runs in the browser/page: the socket is the viewer's, not the server's. */
  | "browser"
  /** The guest fetch bridge, under its own documented policy. */
  | "sandbox-bridge"
  /** The screening code itself. */
  | "screening"
  /** An injectable fetch seam, or prose that reads like a call. */
  | "infrastructure";

export type EgressEntry = {
  /** Repo-relative path. */
  file: string;
  /** The surface a reader would name. */
  owner: string;
  inputSource: UrlInputSource;
  /** Schemes this surface will actually request. */
  schemes: string[];
  /** What credential rides on the request, if any. */
  authScope: string;
  /** Who validates redirect hops. */
  redirects: "checked-per-hop" | "runtime-follows" | "manual-none" | "none";
  /**
   * How the surface answers DNS rebinding — a public name that resolves to a
   * private address. `resolve-and-check` runs a resolution pass;
   * `deployment-egress` names the deployment's egress control as the boundary.
   * See `docs/url-egress-inventory.md` § DNS rebinding.
   */
  dnsRebinding: "resolve-and-check" | "deployment-egress" | "n/a";
  policy: EgressPolicy;
  /** Screening symbols the file calls. Required when `policy` is "guarded". */
  guardedBy: string[];
  /** Why this policy, in one line. */
  note: string;
};

const guardedMedia = (
  file: string,
  owner: string,
  note: string,
  inputSource: UrlInputSource = "workflow"
): EgressEntry => ({
  file,
  owner,
  inputSource,
  schemes: ["https"],
  authScope: "none",
  redirects: "checked-per-hop",
  dnsRebinding: "deployment-egress",
  policy: "guarded",
  guardedBy: ["fetchExternalMedia"],
  note
});

const guardedSafeFetch = (
  file: string,
  owner: string,
  inputSource: UrlInputSource,
  note: string
): EgressEntry => ({
  file,
  owner,
  inputSource,
  schemes: ["https"],
  authScope: "none",
  redirects: "checked-per-hop",
  dnsRebinding: "deployment-egress",
  policy: "guarded",
  guardedBy: ["safeFetch"],
  note
});

const fixedHost = (
  file: string,
  owner: string,
  authScope: string,
  note: string
): EgressEntry => ({
  file,
  owner,
  inputSource: "fixed",
  schemes: ["https"],
  authScope,
  redirects: "runtime-follows",
  dnsRebinding: "n/a",
  policy: "fixed-host",
  guardedBy: [],
  note
});

export const URL_EGRESS_INVENTORY: EgressEntry[] = [
  // ---------------------------------------------------------------- screening
  {
    file: "packages/runtime/src/providers/safe-url.ts",
    owner: "SSRF screening core",
    inputSource: "none",
    schemes: ["https"],
    authScope: "caller's, stripped across an origin boundary",
    redirects: "checked-per-hop",
    dnsRebinding: "deployment-egress",
    policy: "screening",
    guardedBy: [],
    note: "The address table and NodeTool's default egress policy; safeFetch is the protected fetch every guarded surface calls."
  },
  {
    file: "packages/runtime/src/external-media-fetch.ts",
    owner: "media-ref egress policy",
    inputSource: "workflow",
    schemes: ["https", "http (opt-in)"],
    authScope: "none",
    redirects: "checked-per-hop",
    dnsRebinding: "deployment-egress",
    policy: "screening",
    guardedBy: ["safeFetch"],
    note: "safeFetch for a caller-supplied media uri; NODETOOL_ALLOW_PRIVATE_MEDIA_FETCH=1 is the documented self-hosted LAN opt-out and is the one plain fetch here."
  },
  {
    file: "packages/agents/src/network-guard.ts",
    owner: "sandbox fetch / host-binary guard",
    inputSource: "none",
    schemes: ["http", "https"],
    authScope: "guest's own headers",
    redirects: "checked-per-hop",
    dnsRebinding: "resolve-and-check",
    policy: "screening",
    guardedBy: ["isBlockedIpLiteral"],
    note: "Reads the shared address table; allows http and an opt-in private mode that the default policy never does."
  },
  {
    file: "packages/agents/src/apify/policy.ts",
    owner: "Apify actor-input screening",
    inputSource: "model",
    schemes: ["https"],
    authScope: "none",
    redirects: "none",
    dnsRebinding: "deployment-egress",
    policy: "screening",
    guardedBy: ["isSafePublicHttpsUrl"],
    note: "Screens URLs inside an actor input before Apify's own machines fetch them; no socket opens here."
  },

  // ------------------------------------------------------- guarded (media refs)
  guardedMedia(
    "packages/runtime/src/media-ref-bytes.ts",
    "media ref → bytes (Python bridge + TS nodes)",
    "The http(s) fallback every media resolution ends in; #5101 left it unguarded on purpose and this is the decision."
  ),
  guardedMedia(
    "packages/audio-nodes/src/lib/audio-wav.ts",
    "AudioRef → bytes",
    "Same fallback for audio refs."
  ),
  guardedMedia(
    "packages/video-nodes/src/nodes/model3d/utils.ts",
    "Model3DRef / ImageRef → bytes",
    "Same fallback for 3D model and image refs."
  ),
  guardedMedia(
    "packages/nodes-utils/src/model-bytes.ts",
    "Model bytes → bytes (shared resolution)",
    "The shared resolveModelBytes both RenderToImage and the Blender nodes call; same policy."
  ),
  guardedMedia(
    "packages/reve-nodes/src/reve-base.ts",
    "Reve reference-image upload",
    "Reads the ref a workflow points at before sending it to Reve."
  ),
  guardedMedia(
    "packages/huggingface-nodes/src/huggingface-base.ts",
    "HF pipeline media input",
    "Reads a media ref to base64 it into the request body."
  ),
  guardedMedia(
    "packages/fal-nodes/src/fal-base.ts",
    "FAL media upload",
    "Turns a ref's https uri into a data uri for the FAL client."
  ),
  guardedMedia(
    "packages/replicate-nodes/src/replicate-base.ts",
    "Replicate files upload",
    "Fetches the source a workflow named, then uploads it to Replicate."
  ),
  guardedMedia(
    "packages/llm-nodes/src/nodes/openai.ts",
    "OpenAI media input",
    "Reads a ref's uri into a Blob for a multipart request."
  ),
  guardedMedia(
    "packages/together-nodes/src/together-base.ts",
    "Together asset resolution",
    "isSafeHttpUrl judges the initial URL; the protected fetch judges the hops."
  ),
  guardedMedia(
    "packages/atlascloud-nodes/src/atlascloud-factory.ts",
    "AtlasCloud media pass-through",
    "Same pairing: local predicate first, protected fetch for the request itself."
  ),
  {
    ...guardedMedia(
      "packages/websocket/src/websocket-client-session.ts",
      "chat source images",
      "Held a third copy of the address table and screened only the first URL; both sites now take the shared policy."
    ),
    inputSource: "chat-client"
  },
  guardedMedia(
    "packages/websocket/src/session/asset-autosave.ts",
    "workflow output auto-save",
    "Reads the uri a workflow output named before storing the bytes as an asset."
  ),

  // -------------------------------------------- guarded (provider result URLs)
  guardedSafeFetch(
    "packages/kie-nodes/src/kie-base.ts",
    "KIE result downloads",
    "provider-response",
    "resultUrls / videoUrl / audioUrl come out of a response body; the API calls beside them are fixed-host."
  ),
  {
    ...guardedSafeFetch(
      "packages/topaz-nodes/src/topaz-base.ts",
      "Topaz result downloads",
      "provider-response",
      "download_url from a status body, plus a media-ref read on the way in."
    ),
    guardedBy: ["safeFetch", "fetchExternalMedia"]
  },
  guardedSafeFetch(
    "packages/minimax-nodes/src/minimax-base.ts",
    "MiniMax audio / file downloads",
    "provider-response",
    "download_url and hosted-audio URLs; the poll endpoints beside them are fixed-host."
  ),
  guardedSafeFetch(
    "packages/minimax-nodes/src/nodes/text-to-image.ts",
    "MiniMax image download",
    "provider-response",
    "image_urls out of the generation response."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/fal-provider.ts",
    "FAL provider result download",
    "provider-response",
    "The original reason safeFetch exists."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/replicate-provider.ts",
    "Replicate provider output download",
    "provider-response",
    "Output URLs from a prediction body."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/kie-provider.ts",
    "KIE provider downloads",
    "provider-response",
    "Result and audio URLs; the API calls beside them are fixed-host."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/topaz-provider.ts",
    "Topaz provider download",
    "provider-response",
    "finalUrl from the result body."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/atlascloud-transport.ts",
    "AtlasCloud submit/poll/download, shared by the provider and the node pack",
    "provider-response",
    "Prediction output URLs; submit and poll address the constant API base."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/meshy-provider.ts",
    "Meshy model download",
    "provider-response",
    "model_urls from a task body."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/rodin-provider.ts",
    "Rodin model download",
    "provider-response",
    "Download URL from a task body."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/minimax-provider.ts",
    "MiniMax provider downloads",
    "provider-response",
    "download_url, fetched through the provider's own injected fetch under the same screening."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/evolink-provider.ts",
    "Evolink result download",
    "provider-response",
    "URL out of a task-result body."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/gemini-provider.ts",
    "Gemini file / media URIs",
    "provider-response",
    "file_uri values reaching the provider, plus the Files API download."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/video-frame-fallback.ts",
    "Video frame sampling for providers with no video content part",
    "workflow",
    "Reads a video content part's URI so ffmpeg can sample stills from it."
  ),
  guardedSafeFetch(
    "packages/runtime/src/providers/anthropic-provider.ts",
    "Anthropic media input",
    "workflow",
    "Reads a media URL into a base64 image block."
  ),
  guardedSafeFetch(
    "packages/llm-nodes/src/nodes/gemini.ts",
    "Gemini node video download",
    "provider-response",
    "Generated-video URI; the generateContent calls beside it are fixed-host."
  ),
  guardedSafeFetch(
    "packages/agents/src/capabilities/assets.ts",
    "save_asset / view_image",
    "model",
    "A model names the URL; save_asset fetches it, view_image only passes a screened one to the vision provider (#5101)."
  ),
  guardedSafeFetch(
    "packages/agents/src/apify/assets.ts",
    "Apify run artifacts → assets",
    "provider-response",
    "Key-value store and dataset file URLs out of an actor run."
  ),
  guardedSafeFetch(
    "packages/websocket/src/lib/asset-export.ts",
    "asset ref → bytes on export",
    "chat-client",
    "An http(s) ref stored on a graph or storyboard, read when packing an export."
  ),
  {
    file: "packages/agents/src/capabilities/media.ts",
    owner: "yt_dlp download",
    inputSource: "model",
    schemes: ["http", "https"],
    authScope: "none",
    redirects: "manual-none",
    dnsRebinding: "resolve-and-check",
    policy: "guarded",
    guardedBy: ["assertFetchUrlAllowed", "assertResolvedHostAllowed"],
    note: "yt-dlp opens its own sockets, so the URL is screened and its hostname resolved before the binary sees it — the one surface where a resolution pass is worth its round trip."
  },

  // ------------------------------------------------------------- sandbox bridge
  {
    file: "packages/agents/src/js-sandbox.ts",
    owner: "guest fetch bridge",
    inputSource: "model",
    schemes: ["http", "https"],
    authScope: "guest's own headers",
    redirects: "checked-per-hop",
    dnsRebinding: "deployment-egress",
    policy: "sandbox-bridge",
    guardedBy: ["assertFetchUrlAllowed"],
    note: "Follows redirects manually on Node and re-checks each hop; http and (host-set only) private addresses are allowed here by design — see the sandbox docs."
  },

  // ------------------------------------------------- deliberately private hosts
  {
    file: "packages/runtime/src/comfy-executor.ts",
    owner: "ComfyUI executor",
    inputSource: "workflow",
    schemes: ["http", "https"],
    authScope: "operator-configured token",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "private-integration",
    guardedBy: [],
    note: "A Comfy server is normally on localhost or the LAN — reaching it is the feature, so screening private addresses would refuse the ordinary case. The address is the node's `endpoint` property, so the graph author picks it, and the two runners are allowlisted on the cloud profile."
  },
  {
    file: "packages/agents/src/capabilities/web.ts",
    owner: "browse / http_request / download_file / take_screenshot",
    inputSource: "model",
    schemes: ["https"],
    authScope: "none on the model's URL; operator key on BROWSER_URL",
    redirects: "checked-per-hop",
    dnsRebinding: "deployment-egress",
    policy: "private-integration",
    guardedBy: ["safeFetch"],
    note: "Every model-named URL goes through safeFetch; the one plain fetch is the operator's BROWSER_URL screenshot service, which is usually internal on purpose."
  },
  {
    file: "packages/cli/src/nodetool.ts",
    owner: "CLI asset resolution",
    inputSource: "operator",
    schemes: ["http", "https"],
    authScope: "local session",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "private-integration",
    guardedBy: [],
    note: "Runs on the operator's own machine against their own API URL, which is loopback by default."
  },
  {
    file: "packages/deploy/src/admin-client.ts",
    owner: "deploy admin client",
    inputSource: "operator",
    schemes: ["http", "https"],
    authScope: "deployment admin token",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "private-integration",
    guardedBy: [],
    note: "Talks to the server the operator is deploying, by the address they gave."
  },
  {
    file: "packages/node-sdk/src/package-registry-client.ts",
    owner: "node-pack registry",
    inputSource: "operator",
    schemes: ["https"],
    authScope: "none",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "private-integration",
    guardedBy: [],
    note: "A constant registry URL, overridable by env for a self-hosted registry."
  },

  // ---------------------------------------------------------- browser-side only
  {
    file: "packages/image-nodes/src/nodes/image-io.ts",
    owner: "image ref → bytes (browser branch)",
    inputSource: "workflow",
    schemes: ["http", "https", "relative"],
    authScope: "the page's own cookies",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "browser",
    guardedBy: [],
    note: "Guarded by `!IS_NODE`: the socket is the viewer's browser, and the server path above it is loadMediaRefBytes."
  },
  {
    file: "packages/core-nodes/src/nodes/fake-media.ts",
    owner: "browser-only image filter",
    inputSource: "workflow",
    schemes: ["http", "https", "data"],
    authScope: "the page's own cookies",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "browser",
    guardedBy: [],
    note: "Returns the input untouched off the browser worker; the fetch feeds createImageBitmap."
  },
  {
    file: "packages/browser/src/capture.ts",
    owner: "in-page capture",
    inputSource: "workflow",
    schemes: ["http", "https"],
    authScope: "the driven page's credentials",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "browser",
    guardedBy: [],
    note: "Runs inside `page.evaluate`, so the request comes from the driven browser, not from Node."
  },

  // ------------------------------------------------------------ infrastructure
  {
    file: "packages/runtime/src/context.ts",
    owner: "ProcessingContext._fetch",
    inputSource: "none",
    schemes: ["http", "https"],
    authScope: "caller's",
    redirects: "runtime-follows",
    dnsRebinding: "n/a",
    policy: "infrastructure",
    guardedBy: [],
    note: "The injectable fetch seam a provider may be constructed with; safeFetch takes it as fetchImpl so screening still runs on every hop."
  },
  {
    file: "packages/agents/src/codeact/nodetool-api.ts",
    owner: "CodeAct prompt text",
    inputSource: "none",
    schemes: [],
    authScope: "none",
    redirects: "none",
    dnsRebinding: "n/a",
    policy: "infrastructure",
    guardedBy: [],
    note: "The match is prose describing `nodetool.web.fetch(url)` to a model, not a call."
  },

  // --------------------------------------------------------------- fixed hosts
  fixedHost(
    "packages/agents/src/apify/client.ts",
    "Apify API client",
    "APIFY_API_TOKEN (host-held)",
    "api.apify.com, path built from a validated actor id."
  ),
  fixedHost(
    "packages/agents/src/serpapi/client.ts",
    "SerpAPI client",
    "SERPAPI_API_KEY (host-held)",
    "serpapi.com; parameters checked against the engine's contract first."
  ),
  fixedHost(
    "packages/agents/src/tools/dataseo-tools.ts",
    "DataForSEO tools",
    "DataForSEO basic auth",
    "api.dataforseo.com."
  ),
  fixedHost(
    "packages/agents/src/tools/serp-providers/apify-provider.ts",
    "Apify search backend",
    "APIFY_API_TOKEN",
    "api.apify.com run and dataset endpoints."
  ),
  fixedHost(
    "packages/agents/src/tools/serp-providers/brave-provider.ts",
    "Brave search backend",
    "BRAVE_API_KEY",
    "api.search.brave.com."
  ),
  fixedHost(
    "packages/agents/src/tools/serp-providers/dataforseo-provider.ts",
    "DataForSEO search backend",
    "DataForSEO basic auth",
    "api.dataforseo.com."
  ),
  fixedHost(
    "packages/agents/src/tools/serp-providers/gemini-provider.ts",
    "Gemini search backend",
    "GEMINI_API_KEY",
    "generativelanguage.googleapis.com, model id from a constant."
  ),
  fixedHost(
    "packages/elevenlabs-nodes/src/nodes/text-to-speech.ts",
    "ElevenLabs TTS",
    "ELEVENLABS_API_KEY",
    "api.elevenlabs.io."
  ),
  fixedHost(
    "packages/fal-codegen/src/fal-pricing-fetch.ts",
    "FAL pricing generator",
    "FAL_API_KEY",
    "Build-time only; never runs on a server."
  ),
  fixedHost(
    "packages/fal-codegen/src/schema-fetcher.ts",
    "FAL schema generator",
    "FAL_API_KEY",
    "Build-time only."
  ),
  fixedHost(
    "packages/kie-codegen/src/schema-fetcher.ts",
    "KIE schema generator",
    "KIE_API_KEY",
    "Build-time only."
  ),
  fixedHost(
    "packages/replicate-codegen/src/schema-fetcher.ts",
    "Replicate schema generator",
    "REPLICATE_API_TOKEN",
    "Build-time only."
  ),
  fixedHost(
    "packages/fal-nodes/src/fal-base.ts",
    "FAL queue + upload",
    "FAL_API_KEY",
    "fal.run / fal.ai endpoints; the media-ref read beside them is guarded."
  ),
  fixedHost(
    "packages/fal-nodes/src/fal-billing.ts",
    "FAL billing",
    "FAL_API_KEY",
    "fal.ai billing endpoint."
  ),
  fixedHost(
    "packages/fal-nodes/src/fal-dynamic.ts",
    "FAL model discovery",
    "FAL_API_KEY",
    "OpenAPI + model-info URLs built from a constant base."
  ),
  fixedHost(
    "packages/fal-nodes/src/fal-provider.ts",
    "FAL node provider bridge",
    "FAL_API_KEY",
    "fal endpoints from a constant base."
  ),
  fixedHost(
    "packages/huggingface/src/llama-cpp-download.ts",
    "GGUF model download",
    "HF_TOKEN",
    "huggingface.co, path from the repo id the operator picked."
  ),
  fixedHost(
    "packages/llm-nodes/src/nodes/gemini.ts",
    "Gemini nodes",
    "GEMINI_API_KEY",
    "generativelanguage.googleapis.com; the video download beside them is guarded."
  ),
  fixedHost(
    "packages/models/src/codex-token.ts",
    "Codex OAuth refresh",
    "the user's refresh token",
    "A constant token endpoint."
  ),
  fixedHost(
    "packages/models/src/google-token.ts",
    "Google OAuth refresh",
    "the user's refresh token",
    "A constant token endpoint."
  ),
  fixedHost(
    "packages/runtime/src/google/client.ts",
    "Google API client",
    "the user's Google OAuth token",
    "googleapis.com from constants."
  ),
  fixedHost(
    "packages/runtime/src/providers/codex-provider.ts",
    "Codex provider",
    "the user's Codex token",
    "Constant base URL."
  ),
  fixedHost(
    "packages/runtime/src/providers/huggingface-provider.ts",
    "HuggingFace provider",
    "HF_TOKEN",
    "router.huggingface.co."
  ),
  fixedHost(
    "packages/storage/src/s3/client.ts",
    "S3 storage adapter",
    "SigV4-signed operator credentials",
    "The bucket endpoint this install is configured with."
  ),
  fixedHost(
    "packages/storage/src/supabase-rest.ts",
    "Supabase storage adapter",
    "the service key",
    "The project URL this install is configured with."
  ),
  fixedHost(
    "packages/vectorstore/src/embedding.ts",
    "embedding backend",
    "provider key",
    "The configured embedding endpoint."
  ),
  fixedHost(
    "packages/vectorstore/src/postgrest.ts",
    "PostgREST vector store",
    "the service key",
    "The configured PostgREST URL."
  ),
  fixedHost(
    "packages/websocket/src/models-api.ts",
    "model catalog routes",
    "provider keys",
    "Provider catalog endpoints from constants."
  ),
  fixedHost(
    "packages/websocket/src/oauth-api.ts",
    "OAuth routes",
    "the OAuth code / token in flight",
    "HuggingFace, GitHub and OpenAI endpoints, all constants."
  ),
  fixedHost(
    "packages/websocket/src/routes/fal-credits.ts",
    "FAL credits route",
    "FAL_API_KEY",
    "A constant billing endpoint."
  ),
  fixedHost(
    "packages/websocket/src/routes/fal-pricing.ts",
    "FAL pricing route",
    "FAL_API_KEY",
    "A constant pricing endpoint."
  ),
  fixedHost(
    "packages/websocket/src/routes/fal-pricing-estimate.ts",
    "FAL pricing estimate route",
    "FAL_API_KEY",
    "A constant pricing endpoint."
  ),
  fixedHost(
    "packages/websocket/src/routes/kie-credits.ts",
    "KIE credits route",
    "KIE_API_KEY",
    "A constant credits endpoint."
  ),
  fixedHost(
    "packages/websocket/src/trpc/routers/models.ts",
    "model tRPC router",
    "provider keys",
    "Provider catalog endpoints from constants."
  ),
  fixedHost(
    "packages/runtime/src/providers/kie-provider.ts",
    "KIE provider API calls",
    "KIE_API_KEY",
    "kie.ai endpoints; the downloads beside them are guarded."
  ),
  fixedHost(
    "packages/runtime/src/providers/meshy-provider.ts",
    "Meshy API calls",
    "MESHY_API_KEY",
    "api.meshy.ai; the model download beside them is guarded."
  ),
  fixedHost(
    "packages/runtime/src/providers/rodin-provider.ts",
    "Rodin API calls",
    "RODIN_API_KEY",
    "Hyper3D endpoints; the model download beside them is guarded."
  ),
  fixedHost(
    "packages/runtime/src/providers/topaz-provider.ts",
    "Topaz provider API calls",
    "TOPAZ_API_KEY",
    "api.topazlabs.com; the download beside them is guarded."
  ),
  fixedHost(
    "packages/kie-nodes/src/kie-base.ts",
    "KIE API calls",
    "KIE_API_KEY",
    "kie.ai endpoints; the result downloads beside them are guarded."
  ),
  fixedHost(
    "packages/minimax-nodes/src/minimax-base.ts",
    "MiniMax API calls",
    "MINIMAX_API_KEY",
    "MiniMax endpoints; the downloads beside them are guarded."
  ),
  fixedHost(
    "packages/topaz-nodes/src/topaz-base.ts",
    "Topaz API calls",
    "TOPAZ_API_KEY",
    "api.topazlabs.com; the downloads beside them are guarded."
  )
];
