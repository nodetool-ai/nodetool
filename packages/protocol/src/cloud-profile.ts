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
 * - `lib.comfy.RunWorkflow` / `lib.comfy.RunWorkflowOnWorker` — the two ComfyUI
 *   runners. Running a ComfyUI graph is image generation, which is what this
 *   profile is for. Named rather than whole-listed for the same reason as the
 *   Code node: a later `lib.comfy` node is out until someone reviews it. Each
 *   node calls the ComfyUI server its `endpoint`/`worker_url` property names,
 *   so the address is graph data — see the ComfyUI row in
 *   `docs/url-egress-inventory.md`.
 *
 * `lib.video.download.YtDlpDownload` used to sit here. It is out: a managed
 * multi-tenant server pulling media from arbitrary sites on a user's behalf is
 * a different product from a downloader running on that user's own machine,
 * and datacenter egress is what the sites it targets block first — so the node
 * offered cloud users a button that mostly returns an extractor error. The
 * `yt_dlp` capability is gated on the same profile (see `isYtDlpEnabled` in
 * `@nodetool-ai/agents`), so chat and the Code node do not route around the
 * node's absence. Both come back under `NODETOOL_NODE_PROFILE=full`, which is
 * what a self-hosted install of the same image runs.
 */
export const CLOUD_NODE_ALLOWLIST: readonly string[] = [
  // Sandboxed code only.
  "nodetool.code.Code",
  // ComfyUI runners only — the rest of lib.comfy stays out.
  "lib.comfy.RunWorkflow",
  "lib.comfy.RunWorkflowOnWorker"
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
 * - `nodetool.agents.*` — kept as a namespace for Agent, Classifier,
 *   Extractor, Summarizer, CreateThread, and EnhancePrompt. Specialist
 *   tool-agent nodes were removed; ffmpeg, yt-dlp, and browser are
 *   CodeAct capabilities instead.
 */
export const CLOUD_NODE_DENYLIST: readonly string[] = [
  ...CLOUD_HOST_FILE_NODES,
  "nodetool.text.LoadTextFolder",
  "nodetool.text.LoadTextAssets",
  "nodetool.text.SaveText",
  "nodetool.text.SaveTextFile"
];

/**
 * Providers kept *out* of the cloud product. Every other registered provider
 * is offered — the node catalog is curated, the provider list is not.
 *
 * The rule is reachability, not curation: a provider stays out when the cloud
 * server cannot reach it on the user's behalf. That is either an engine that
 * runs on the user's own machine (Ollama, LM Studio, llama.cpp, vLLM,
 * Transformers.js in-process) or a personal subscription reached by spawning a
 * local CLI (the Claude Agent SDK shells out to `claude`). Everything else is
 * an HTTP API behind a key the user pastes into settings, which works the same
 * from a Fly machine as from a laptop.
 *
 * A curated allowlist sat here before, and every provider it omitted still had
 * an API-key card in settings: a cloud user could save an OpenRouter key and
 * find an empty model picker, with nothing saying why. Listing only what
 * genuinely cannot work keeps the settings UI and the registry from drifting.
 *
 * The local engines are additionally never registered under the cloud profile
 * (see the provider index); naming them here keeps the predicate honest for
 * anything registered after that gate, and for callers asking about a
 * provider id on its own.
 */
export const NON_CLOUD_PROVIDER_IDS: readonly string[] = [
  // Engines that run on the user's own machine.
  "ollama",
  "lmstudio",
  "llama_cpp",
  "node_llama_cpp",
  "vllm",
  "mlx",
  "transformers_js",
  // A personal subscription reached by spawning the local `claude` CLI.
  "claude_agent_sdk",
  // Test double, dev-gated at registration.
  "fake"
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

/**
 * Whether `providerId` is exposed in the cloud product — true for everything
 * except the local engines and local-CLI subscriptions in
 * {@link NON_CLOUD_PROVIDER_IDS}. An unknown id is treated as cloud-eligible:
 * a provider added to the registry reaches cloud users without a second edit
 * here, and one that cannot work there has to be named.
 */
export function isCloudProvider(providerId: string): boolean {
  return !NON_CLOUD_PROVIDER_IDS.includes(providerId);
}
