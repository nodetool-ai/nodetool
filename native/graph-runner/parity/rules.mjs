// Rules for the parity suite: which nodes are never run, which reference
// failures mean "cannot run offline", and how a native failure names the
// capability it lacks. run.mjs applies them in that order.

const prefix = (...prefixes) => (node) => prefixes.some((p) => node.type.startsWith(p));

/** Model providers that run on this machine. A default on one loads a local model. */
const LOCAL_PROVIDERS = new Set([
  "transformers_js",
  "llama_cpp",
  "node_llama_cpp",
  "whisper_cpp",
  "mlx",
  "huggingface_local",
  "ollama",
  "lmstudio",
  "vllm"
]);

/**
 * Nodes that are never run, on either side. A parity run must not start
 * host programs, browsers or local models, or wait for outside events.
 */
export const SKIP_RULES = [
  { id: "host-binary:blender", reason: "spawns Blender", match: prefix("nodetool.blender.") },
  { id: "host-binary:manimgx", reason: "spawns ManimGX (Python)", match: prefix("nodetool.manimgx.") },
  { id: "host-binary:yt-dlp", reason: "spawns yt-dlp", match: prefix("lib.video.download.") },
  {
    id: "host-binary:stable-diffusion-cpp",
    reason: "spawns stable-diffusion.cpp",
    match: prefix("lib.stable_diffusion_cpp.")
  },
  { id: "host-binary:wan2gp", reason: "starts Wan2GP", match: prefix("lib.wan2gp.") },
  { id: "host-binary:comfy", reason: "starts or calls ComfyUI", match: prefix("lib.comfy.") },
  { id: "host-binary:codex", reason: "spawns the Codex CLI", match: prefix("codex.") },
  { id: "host-binary:claude-code", reason: "spawns the Claude Code CLI", match: prefix("claude_code.") },
  {
    id: "browser",
    reason: "launches Chromium through Playwright",
    match: prefix("lib.browser.", "nodetool.timeline.RenderTimeline")
  },
  {
    id: "local-model",
    reason: "a model property defaults to a local provider",
    match: (node) =>
      node.properties.some(
        (p) => p.default && typeof p.default === "object" && LOCAL_PROVIDERS.has(p.default.provider)
      )
  },
  { id: "trigger", reason: "waits for outside events until cancelled", match: (node) => node.is_trigger },
  {
    id: "nondeterministic",
    reason: "outputs the wall-clock time it resumed at",
    match: prefix("nodetool.triggers.Wait")
  },
  {
    id: "nondeterministic",
    reason: "outputs a thread id made from the clock and a random suffix",
    match: prefix("nodetool.agents.CreateThread")
  }
];

export function skipRuleFor(node) {
  return SKIP_RULES.find((rule) => rule.match(node)) ?? null;
}

/**
 * Reference failures that mean the TypeScript side cannot run the node
 * offline. Checked in order against the reference's error messages.
 */
export const OFFLINE_REASONS = [
  {
    id: "network",
    pattern:
      /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|getaddrinfo|socket hang up|ECONNRESET|Connection error|network/i
  },
  {
    id: "database",
    pattern: /ProcessingContext model interface '\w+' is not configured/
  },
  {
    id: "secret",
    pattern:
      /api[ _-]?key|secret|credential|not configured|unauthori[sz]ed|\b401\b|_TOKEN\b|GOOGLE_CLOUD_PROJECT|access token/i
  },
  {
    id: "model",
    pattern: /requires an? \w*model to be selected|select a model|no model|model is required|model .*not (found|set|selected)|provider is required|unknown provider|empty provider/i
  },
  { id: "gpu", pattern: /WebGPU|GPU adapter|GPU device|Dawn|Vulkan/i },
  { id: "host-binary", pattern: /spawn \S+ ENOENT|not found on PATH|binary not found|is not installed/i }
];

export function offlineReasonFor(errors) {
  for (const reason of OFFLINE_REASONS) {
    const hit = errors.find((e) => reason.pattern.test(e));
    if (hit) return { id: reason.id, error: hit };
  }
  return null;
}

/** Short path for files under node_modules or packages/ in stub messages. */
function shortPath(path) {
  const nm = path.lastIndexOf("node_modules/");
  if (nm !== -1) return path.slice(nm + "node_modules/".length);
  const pk = path.indexOf("/packages/");
  return pk !== -1 ? path.slice(pk + 1) : path;
}

/** Node error messages that already say which capability is missing. */
const KNOWN_GAPS = [
  [/WebGPU is not available/, "WebGPU (navigator.gpu)"],
  [/The 'sharp' image codec is unavailable/, "sharp (native image codec)"]
];

/**
 * The capability a native error says the guest or kernel lacks, or null when
 * the message names none.
 */
export function capabilityOf(message) {
  for (const [pattern, name] of KNOWN_GAPS) if (pattern.test(message)) return name;
  let m = /guest: (.+?) is unavailable in the native runner(?: \((.+?)\))?/.exec(message);
  if (m) return m[2] ? `${shortPath(m[1])} (${m[2]})` : shortPath(m[1]);
  m = /(?:ReferenceError: )?'?([A-Za-z_$][\w$]*)'? is not defined/.exec(message);
  if (m) return `global ${m[1]}`;
  m = /The optional "(.+?)" package/.exec(message);
  if (m) return `optional package ${m[1]}`;
  m = /^(.*?) (?:are|is) not supported by the native runner/.exec(message);
  if (m) return `kernel: ${m[1]}`;
  return null;
}

/** The group a capability ranks under: its module or global, without the member. */
export function capabilityGroup(capability) {
  if (capability.startsWith("global ") || capability.startsWith("kernel:")) return capability;
  if (capability.includes(" (")) return capability;
  const m = /^((?:@[^/]+\/)?[^.]+?)(?:\.[A-Za-z_$][\w$]*)$/.exec(capability);
  return m ? m[1] : capability;
}

/** The exported name a capability refers to, so re-exports of one function rank together. */
export function capabilityExport(capability) {
  const m = /^@nodetool-ai\/[^.]+?\.([A-Za-z_$][\w$]*)$/.exec(capability);
  return m ? `@nodetool-ai/* .${m[1]}` : capability;
}
