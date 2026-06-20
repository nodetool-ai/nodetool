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

/** Env var + value that put the server in production mode. */
export const NODE_ENV_VAR = "NODETOOL_ENV";
export const PRODUCTION_ENV_VALUE = "production";

/**
 * True when the cloud profile should apply. The commercial cloud product runs
 * in production mode, so production *is* the cloud profile; the explicit
 * `NODETOOL_NODE_PROFILE=cloud` flag additionally enables it outside
 * production (e.g. for local testing). Callers pass the raw env values so this
 * stays free of any runtime/env dependency and remains trivially testable.
 */
export function isCloudProfileActive(
  profileValue: string | undefined | null,
  nodeEnvValue: string | undefined | null
): boolean {
  return (
    profileValue === CLOUD_PROFILE_VALUE ||
    nodeEnvValue === PRODUCTION_ENV_VALUE
  );
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
  // (nodetool.text and nodetool.code are NOT whole-namespace allows: only a
  // curated subset is kept via CLOUD_NODE_ALLOWLIST below.)
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
 * - `nodetool.code.Code` — the sandboxed (vm-based) JavaScript node only. The
 *   rest of `nodetool.code` (Python/Bash/Ruby/Lua subprocess + Docker runners)
 *   stays out: arbitrary process/Docker execution isn't appropriate for a
 *   managed multi-tenant cloud.
 * - `nodetool.text.*` — a creative-text toolkit (prompt building, formatting,
 *   templating, joining, light parsing/splitting). The low-level string/regex/
 *   token/whitespace utilities and file I/O are dropped — they're programmer
 *   plumbing, not creative tools.
 */
export const CLOUD_NODE_ALLOWLIST: readonly string[] = [
  // Sandboxed code only.
  "nodetool.code.Code",
  // Curated creative-text nodes.
  "nodetool.text.Prompt",
  "nodetool.text.Template",
  "nodetool.text.Concat",
  "nodetool.text.Join",
  "nodetool.text.Collect",
  "nodetool.text.Replace",
  "nodetool.text.ToString",
  "nodetool.text.SaveText",
  "nodetool.text.Split",
  "nodetool.text.Slice",
  "nodetool.text.Chunk",
  "nodetool.text.Extract",
  "nodetool.text.ParseJSON",
  "nodetool.text.ExtractJSON"
];

/**
 * Node types removed even though their namespace is allowed. These are the
 * developer/automation-flavored agents inside `nodetool.agents`: they wrap the
 * very integrations the cloud profile drops (shell, git, sqlite, supabase,
 * http, filesystem, browser, office docs) and don't fit a creative workspace.
 *
 * Kept agents: Agent, Classifier, Extractor, Summarizer, CreateThread,
 * ImageAgent, MediaAgent, FfmpegAgent, DocumentAgent.
 */
export const CLOUD_NODE_DENYLIST: readonly string[] = [
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
 */
export const CLOUD_PROVIDER_IDS: readonly string[] = [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "mistral",
  "xai",
  "fal_ai",
  "kie"
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
