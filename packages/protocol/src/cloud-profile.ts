/**
 * Curated "cloud" node + provider profile for the commercial NodeTool cloud
 * product.
 *
 * The full NodeTool catalog ships ~3,500 nodes across ~60 namespaces — far
 * more than a small team can support at a high quality bar, and much of it
 * (filesystem, databases, scraping, messaging, office-doc tooling, local model
 * runtimes) is developer/automation plumbing that dilutes the "creative AI
 * workspace" mission. The cloud product instead offers a deliberately small,
 * curated surface focused on generating and editing text, images, audio,
 * video, and 3D — plus the Code node for power users.
 *
 * This module is the single source of truth, shared between the server (which
 * prunes the registry and the provider list at bootstrap) and any UI that
 * wants to reflect the same policy. It is intentionally pure data + pure
 * predicates: the env read that decides *whether* the profile is active lives
 * at the application boundary (see {@link isCloudProfileActive}).
 *
 * Activate by setting `NODETOOL_NODE_PROFILE=cloud`. When unset (the default),
 * none of this applies and the full catalog loads unchanged.
 */

/** Env var that selects the active node profile. */
export const CLOUD_PROFILE_ENV = "NODETOOL_NODE_PROFILE";

/** Value of {@link CLOUD_PROFILE_ENV} that turns on the curated cloud profile. */
export const CLOUD_PROFILE_VALUE = "cloud";

/**
 * Value of {@link CLOUD_PROFILE_ENV} that keeps the full catalog and provider
 * list even in production. Self-hosted deployments (docker-compose) set this
 * to opt out of the cloud curation the production default would apply.
 */
export const FULL_PROFILE_VALUE = "full";

/** Env var + value that put the server in production mode. */
export const NODE_ENV_VAR = "NODETOOL_ENV";
export const PRODUCTION_ENV_VALUE = "production";

/**
 * True when the cloud profile should apply. An explicit
 * `NODETOOL_NODE_PROFILE` always wins: `cloud` turns the profile on (e.g. for
 * local testing), any other value — canonically {@link FULL_PROFILE_VALUE} —
 * turns it off. When unset, production defaults to the cloud profile because
 * the commercial cloud product runs in production mode; self-hosted
 * deployments set `NODETOOL_NODE_PROFILE=full` to keep the full catalog.
 * Callers pass the raw env values so this stays free of any runtime/env
 * dependency and remains trivially testable.
 */
export function isCloudProfileActive(
  profileValue: string | undefined | null,
  nodeEnvValue: string | undefined | null
): boolean {
  if (profileValue != null && profileValue.trim() !== "") {
    return profileValue === CLOUD_PROFILE_VALUE;
  }
  return nodeEnvValue === PRODUCTION_ENV_VALUE;
}

/**
 * Namespace prefixes kept in the cloud product. A node type is allowed when it
 * sits under one of these (segment-boundary match), unless it appears in
 * {@link CLOUD_NODE_DENYLIST}.
 *
 * Grouped by intent — keep this list short; every entry is surface a small
 * team has to support.
 */
export const CLOUD_NODE_NAMESPACES: readonly string[] = [
  // — Workflow scaffolding & editor-essential plumbing —
  "nodetool.input",
  "nodetool.output",
  "nodetool.constant",
  "nodetool.control",
  "nodetool.list",
  "nodetool.compare",
  "nodetool.workflows", // workflow_node, subgraph, base_node (Preview)
  "nodetool.group", // editor Loop/Group containers
  "nodetool.llm", // generic Chat node (also surfaces Anthropic/Groq)

  // — Creative generation core —
  // (nodetool.code is NOT a whole-namespace allow: the sandboxed Code node is
  // admitted by name via CLOUD_NODE_ALLOWLIST below.)
  "nodetool.text", // text toolkit + ASR; file-I/O nodes trimmed by CLOUD_NODE_DENYLIST
  "nodetool.image",
  "nodetool.sketch",
  "nodetool.audio", // covers .synth and .realtime
  "nodetool.video",
  "nodetool.timeline",
  "nodetool.model3d",
  "nodetool.generators",
  "nodetool.agents", // trimmed by CLOUD_NODE_DENYLIST below

  // — Creative media toolkit (Photoshop/After-Effects-style ops) —
  "lib.image", // warp, color, draw, effects, filter, channel, keyer, mask, …
  "lib.svg",
  "lib.grid",
  "lib.audio", // DSP / effects (reverb, delay, EQ, …)

  // — Provider node namespaces: the big LLM/multimodal labs + Fal + Kie —
  "openai", // openai.text / .image / .audio / .agents
  "gemini", // gemini.text / .image / .audio / .video
  "mistral", // mistral.text / .vision / .embeddings
  "xai", // xai.text / .image / .vision
  "fal", // fal.* (hosted image/video/audio models)
  "kie" // kie.* (hosted image/video/audio models)
];

/**
 * Individual node types kept even though their namespace is *not* whole-listed
 * above. Used to admit a narrow slice of an otherwise-trimmed namespace:
 *
 * - `nodetool.code.Code` — the sandboxed (QuickJS WASM) JavaScript node only.
 *   Admitting it by name rather than whole-listing `nodetool.code` keeps any
 *   future node in that namespace out of the cloud until it is reviewed.
 */
export const CLOUD_NODE_ALLOWLIST: readonly string[] = [
  // Sandboxed code only.
  "nodetool.code.Code"
];

/**
 * Nodes that read or write a path on the server's own filesystem and sit
 * inside an otherwise-allowed namespace, so only naming them keeps them out.
 *
 * Two shapes end up here. Most declare a path property the editor renders as a
 * native file/folder picker (`json_schema_extra: { type: "file_path" }`) —
 * `nodetool.input.DocumentFileInput` is the one users hit first. The rest take
 * a plain string path and call `fs` in `process()`; nothing in their metadata
 * distinguishes them, which is why this list is written out rather than
 * derived.
 *
 * Split out from {@link CLOUD_NODE_DENYLIST} so the "no host filesystem in the
 * cloud" rule is one reviewable list instead of entries scattered by namespace.
 */
export const CLOUD_HOST_FILE_NODES: readonly string[] = [
  // Path pickers — a local path typed into a browser tab points at the
  // container's disk, not the user's machine.
  "nodetool.input.DocumentFileInput",
  "nodetool.input.FilePathInput",
  "nodetool.input.FolderPathInput",
  // Media loaders/savers that go to disk. Their asset-store siblings
  // (LoadImageAssets, SaveImage, SaveAudio, SaveVideo, …) stay.
  "nodetool.audio.LoadAudioFile",
  "nodetool.audio.LoadAudioFolder",
  "nodetool.audio.SaveAudioFile",
  "nodetool.image.LoadImageFile",
  "nodetool.image.LoadImageFolder",
  "nodetool.image.SaveImageFile",
  "nodetool.video.LoadVideoFile",
  "nodetool.video.SaveVideoFile",
  "nodetool.model3d.LoadModel3DFile",
  "nodetool.model3d.SaveModel3DFile"
];

/**
 * Node types removed even though their namespace is allowed. Three groups:
 *
 * - Host-filesystem nodes — {@link CLOUD_HOST_FILE_NODES} above, which this
 *   list embeds. A node that reads or writes a path on the server's own disk
 *   has no meaning in a managed multi-tenant cloud: the path belongs to the
 *   container, not to the user sitting in the browser. The matching HTTP
 *   surfaces are already refused in production (`/api/files/local`, the
 *   workspace routes, tRPC `files.list`), so leaving the nodes in the palette
 *   only offers a picker that cannot pick and a run that cannot resolve.
 *   Assets are the cloud's file story: the `*Assets` loaders and the plain
 *   `SaveImage`/`SaveAudio`/`SaveVideo`/`SaveDataframe` savers go through the
 *   asset store and stay.
 * - `nodetool.text.*` file I/O — `nodetool.text` is whole-listed for its
 *   creative-text toolkit and ASR, but the folder/asset loaders and the two
 *   filesystem writers (`SaveText`, `SaveTextFile` — both call fs.writeFile on
 *   an unsandboxed host path) are dropped, for the same reason.
 * - `nodetool.agents.*` — the developer/automation-flavored agents that wrap
 *   the very integrations the cloud profile drops (shell, git, sqlite,
 *   supabase, http, filesystem, browser, office docs). Kept agents: Agent,
 *   Classifier, Extractor, Summarizer, CreateThread, ImageAgent, MediaAgent,
 *   FfmpegAgent, DocumentAgent.
 */
export const CLOUD_NODE_DENYLIST: readonly string[] = [
  ...CLOUD_HOST_FILE_NODES,
  "nodetool.text.LoadTextFolder",
  "nodetool.text.LoadTextAssets",
  "nodetool.text.SaveText",
  "nodetool.text.SaveTextFile",
  "nodetool.agents.BrowserAgent",
  "nodetool.agents.LiveBrowserAgent",
  "nodetool.agents.DocxAgent",
  "nodetool.agents.EmailAgent",
  "nodetool.agents.FilesystemAgent",
  "nodetool.agents.GitAgent",
  "nodetool.agents.HtmlAgent",
  "nodetool.agents.HttpApiAgent",
  "nodetool.agents.PdfLibAgent",
  "nodetool.agents.PptxAgent",
  "nodetool.agents.SQLiteAgent",
  "nodetool.agents.ShellAgent",
  "nodetool.agents.SpreadsheetAgent",
  "nodetool.agents.SupabaseAgent",
  "nodetool.agents.VectorStoreAgent",
  "nodetool.agents.YtDlpDownloaderAgent"
];

/**
 * Provider ids exposed in the cloud product: the big foundation-model labs
 * plus Fal and Kie for media. Anthropic and Groq have no dedicated node
 * namespace — they reach users through the Agent / Chat / generator nodes via
 * the provider registry, so they live here only.
 *
 * OpenRouter is here for the same reason the labs are: it is a bring-your-own-key
 * aggregator reached through the same nodes, and one key covers hundreds of
 * models. Pruning it while the settings UI still offers an OpenRouter key card
 * let a cloud user save a key and find an empty model picker.
 */
export const CLOUD_PROVIDER_IDS: readonly string[] = [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
  "xai",
  "openrouter",
  "fal_ai",
  "kie",
  "nodetool"
];

/**
 * Built-in node packs loaded under the cloud profile. `base` is required and
 * always loads; `fal` and `kie` are the only provider packs kept. Every other
 * provider pack (Replicate, Hugging Face, Together, MiniMax, Topaz, Reve,
 * AtlasCloud, ElevenLabs, Transformers.js) stays off.
 */
export const CLOUD_BUILTIN_PACK_IDS: readonly string[] = ["base", "fal", "kie"];

/**
 * Whether `nodeType` is offered in the cloud product. An explicit allowlist
 * entry always wins; otherwise the denylist excludes it; otherwise it must
 * fall under an allowed namespace at a segment boundary so that e.g.
 * `lib.image` admits `lib.image.warp.Offset` but not a hypothetical
 * `lib.imagery.*`.
 */
export function isCloudNodeType(nodeType: string): boolean {
  if (CLOUD_NODE_ALLOWLIST.includes(nodeType)) return true;
  if (CLOUD_NODE_DENYLIST.includes(nodeType)) return false;
  return CLOUD_NODE_NAMESPACES.some(
    (ns) => nodeType === ns || nodeType.startsWith(`${ns}.`)
  );
}

/** Whether `providerId` is exposed in the cloud product. */
export function isCloudProvider(providerId: string): boolean {
  return CLOUD_PROVIDER_IDS.includes(providerId);
}
