export const isHuggingFaceProvider = (provider?: string): boolean => {
  if (!provider) {
    return false;
  }
  return (
    /^huggingface(\/|_|-|\s|$)/i.test(provider) ||
    /^HuggingFace[A-Z]/.test(provider)
  );
};

/** Providers that run on this computer or on a server the user hosts. */
const LOCAL_PROVIDER_IDS: ReadonlySet<string> = new Set([
  "huggingface-local",
  "mlx",
  "node_llama_cpp",
  "stable_diffusion_cpp",
  "transformers_js",
  "whisper_cpp",
  "whisper_cpp_server",
  "lmstudio",
  "vllm"
]);

export const isLocalProvider = (provider?: string): boolean => {
  if (!provider) {
    return false;
  }
  const providerLower = provider.toLowerCase().trim();
  return (
    LOCAL_PROVIDER_IDS.has(providerLower) ||
    providerLower.includes("ollama") ||
    providerLower.includes("llama_cpp") ||
    providerLower.includes("llama-cpp") ||
    providerLower.includes("llamacpp")
  );
};

const insertSpacesBeforeCapitals = (value: string): string => {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
};

export const toTitleCase = (value: string): string => {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

// Returns a clean, human-friendly provider name without any leading "huggingface" prefix
export const getProviderBaseName = (provider?: string): string => {
  if (!provider) {
    return "";
  }
  let remainder = provider;

  // Remove leading variants like "huggingface/", "huggingface_", "huggingface-", "huggingface "
  remainder = remainder.replace(/^huggingface[\s/_-]?/i, "");
  // Handle PascalCase like "HuggingFaceOpenAI"
  remainder = remainder.replace(/^HuggingFace/, "");

  // If the value still has a path-like form, keep the last segment
  if (remainder.includes("/")) {
    const parts = remainder.split("/").filter(Boolean);
    remainder = parts[parts.length - 1] ?? remainder;
  }

  // Normalize separators
  remainder = remainder.replace(/[-_]+/g, " ");
  // Add spaces before capitals (e.g., BlackForestLabs -> Black Forest Labs)
  remainder = insertSpacesBeforeCapitals(remainder);
  remainder = remainder.trim();

  if (!remainder) {
    return "Hugging Face";
  }
  return toTitleCase(remainder);
};

const PROVIDER_ALIAS_NAMES: Record<string, string> = {
  openai: "OpenAI",
  chatgpt: "ChatGPT",
  claude_agent_sdk: "Claude",
  "claude-agent-sdk": "Claude",
  hunyuan3d: "Hunyuan3D",
  hunyuan3d_v2: "Hunyuan3D V2",
  hunyuan3d_v3: "Hunyuan3D 3.0",
  "hunyuan3d-v2": "Hunyuan3D V2",
  "hunyuan3d-3.0": "Hunyuan3D 3.0",
  "hunyuan3d-30": "Hunyuan3D 3.0",
  hunyuan3d_3_0: "Hunyuan3D 3.0",
  trellis: "Trellis",
  "trellis-2": "Trellis 2",
  trellis_2: "Trellis 2",
  trellis2: "Trellis 2",
  triposr: "TripoSR",
  tripo_sr: "TripoSR",
  shap_e: "Shap-E",
  "shap-e": "Shap-E",
  point_e: "Point-E",
  "point-e": "Point-E",
  meshy: "Meshy AI",
  "meshy-ai": "Meshy AI",
  nodetool: "NodeTool",
  rodin: "Rodin AI",
  "rodin-ai": "Rodin AI",
  mlx: "MLX"
};

// Fallback formatter for arbitrary provider strings
export const formatGenericProviderName = (provider?: string): string => {
  if (!provider) {
    return "";
  }
  // Normalize common aliases for display
  const providerLower = provider.toLowerCase();
  if (providerLower === "whisper_cpp") {
    return "whisper.cpp";
  }
  if (providerLower === "whisper_cpp_server") {
    return "whisper.cpp server";
  }
  if (providerLower === "stable_diffusion_cpp") {
    return "sd.cpp";
  }

  if (PROVIDER_ALIAS_NAMES[providerLower]) {
    return PROVIDER_ALIAS_NAMES[providerLower];
  }
  if (
    providerLower === "node_llama_cpp" ||
    providerLower === "node-llama-cpp"
  ) {
    return "llama.cpp";
  }
  // This provider connects to a llama-server the user runs, so it takes the
  // server's name. The in-process provider above is "llama.cpp".
  if (
    providerLower === "llama_cpp" ||
    providerLower === "llama-cpp" ||
    providerLower === "llamacpp"
  ) {
    return "llama-server";
  }
  if (providerLower === "google") {
    return "Gemini";
  }
  if (
    providerLower === "fal_ai" ||
    providerLower === "fal-ai" ||
    providerLower === "falai"
  ) {
    return "FAL AI";
  }
  if (
    providerLower === "elevenlabs" ||
    providerLower === "eleven_labs" ||
    providerLower === "eleven-labs"
  ) {
    return "ElevenLabs";
  }
  if (
    providerLower === "zai-org" ||
    providerLower === "zai_org" ||
    providerLower === "zai"
  ) {
    return "Z.AI";
  }
  if (providerLower === "moonshot" || providerLower === "kimi") {
    return "Moonshot AI";
  }
  if (providerLower === "minimax") {
    return "MiniMax";
  }
  if (providerLower === "gmi") {
    return "GMI Cloud";
  }
  if (providerLower === "meta") {
    return "Meta AI";
  }
  if (providerLower === "alibaba") {
    return "Alibaba Cloud";
  }
  if (providerLower === "cohere") {
    return "Cohere";
  }
  if (
    providerLower === "voyage" ||
    providerLower === "voyage-ai" ||
    providerLower === "voyageai"
  ) {
    return "Voyage AI";
  }
  if (
    providerLower === "jina" ||
    providerLower === "jina-ai" ||
    providerLower === "jinaai"
  ) {
    return "Jina AI";
  }
  const withSpaces = insertSpacesBeforeCapitals(
    provider.replace(/_/g, " ").replace(/-/g, " ")
  );
  return toTitleCase(withSpaces.trim());
};

// Known HF org aliases
const HF_ORG_ALIAS: Record<string, string> = {
  together: "togethercomputer",
  sambanova: "sambanovasystems"
};

// Returns the Hugging Face org slug derived from a provider string
// e.g. "huggingface/fireworks-ai" -> "fireworks-ai"
//      "huggingface_cerebras" -> "cerebras"
//      "HuggingFaceBlackForestLabs" -> "blackforestlabs" (best effort)
const getHuggingFaceSlug = (provider?: string): string | null => {
  if (!provider) {
    return null;
  }
  let remainder = provider;
  remainder = remainder.replace(/^huggingface[\s/_-]?/i, "");
  remainder = remainder.replace(/^HuggingFace/, "");
  if (remainder.includes("/")) {
    const parts = remainder.split("/").filter(Boolean);
    remainder = parts[parts.length - 1] ?? remainder;
  }
  remainder = remainder.trim();
  if (!remainder) {
    return null;
  }
  // Normalize to URL-friendly slug
  let slug = remainder.replace(/\s+/g, "-").replace(/_/g, "-").toLowerCase();
  if (HF_ORG_ALIAS[slug]) {
    slug = HF_ORG_ALIAS[slug];
  }
  return slug || null;
};

const PROVIDER_URLS: Record<string, string> = {
  meshy: "https://www.meshy.ai",
  "meshy-ai": "https://www.meshy.ai",
  rodin: "https://rodin.ai",
  "rodin-ai": "https://rodin.ai",
  triposr: "https://triposr.github.io",
  tripo_sr: "https://triposr.github.io",
  trellis: "https://trellis3d.github.io",
  "trellis-2": "https://trellis3d.github.io",
  trellis_2: "https://trellis3d.github.io",
  trellis2: "https://trellis3d.github.io",
  shap_e: "https://github.com/openai/shap-e",
  "shap-e": "https://github.com/openai/shap-e",
  point_e: "https://github.com/openai/point-e",
  "point-e": "https://github.com/openai/point-e",
  hunyuan3d: "https://github.com/Tencent/Hunyuan3D",
  hunyuan3d_v2: "https://github.com/Tencent/Hunyuan3D",
  hunyuan3d_v3: "https://github.com/Tencent/Hunyuan3D",
  "hunyuan3d-v2": "https://github.com/Tencent/Hunyuan3D",
  "hunyuan3d-3.0": "https://github.com/Tencent/Hunyuan3D",
  "hunyuan3d-30": "https://github.com/Tencent/Hunyuan3D",
  hunyuan3d_3_0: "https://github.com/Tencent/Hunyuan3D"
};

/** Returns an external URL for a given provider name when known; otherwise null. */
/**
 * The name a picker shows for a provider id: the hosting provider for a
 * HuggingFace route ("huggingface_groq" reads "Groq"), the formatted id
 * otherwise.
 */
export const getProviderDisplayName = (provider?: string): string => {
  // The Python worker's Hugging Face provider runs Diffusers and Transformers
  // on this computer. Its id would otherwise reduce to "Local". The picker
  // lists it under Local, so the name needs no suffix.
  if (provider?.toLowerCase() === "huggingface-local") {
    return "Hugging Face";
  }
  return isHuggingFaceProvider(provider)
    ? getProviderBaseName(provider)
    : formatGenericProviderName(provider);
};

export interface ProviderEntry {
  provider: string;
  label: string;
}

/**
 * The model picker's provider sections: enabled cloud providers, enabled
 * local providers, then disabled ones. Each section is sorted by name.
 */
export const groupProvidersBySite = (
  providers: readonly string[],
  enabled: Readonly<Record<string, boolean>>
): { cloud: ProviderEntry[]; local: ProviderEntry[]; disabled: ProviderEntry[] } => {
  const entries = providers
    .map((provider) => ({ provider, label: getProviderDisplayName(provider) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const isEnabled = (p: ProviderEntry) => enabled[p.provider] !== false;
  return {
    cloud: entries.filter((p) => isEnabled(p) && !isLocalProvider(p.provider)),
    local: entries.filter((p) => isEnabled(p) && isLocalProvider(p.provider)),
    disabled: entries.filter((p) => !isEnabled(p))
  };
};

export const getProviderUrl = (provider?: string): string | null => {
  if (!provider) {
    return null;
  }
  const providerLower = provider.toLowerCase();

  if (PROVIDER_URLS[providerLower]) {
    return PROVIDER_URLS[providerLower];
  }
  if (isHuggingFaceProvider(provider)) {
    const slug = getHuggingFaceSlug(provider);
    return slug ? `https://huggingface.co/${slug}` : "https://huggingface.co";
  }
  if (
    providerLower.includes("llama_cpp") ||
    providerLower.includes("llama-cpp") ||
    providerLower.includes("llamacpp")
  ) {
    return "https://github.com/ggerganov/llama.cpp";
  }
  if (providerLower.includes("ollama")) {
    return "https://ollama.com";
  }
  if (providerLower.includes("lmstudio")) {
    return "https://lmstudio.ai";
  }
  if (providerLower.includes("openai")) {
    return "https://platform.openai.com";
  }
  if (providerLower.includes("anthropic")) {
    return "https://console.anthropic.com";
  }
  if (providerLower.includes("gemini") || providerLower.includes("google")) {
    return "https://ai.google.dev";
  }
  if (providerLower.includes("elevenlabs")) {
    return "https://elevenlabs.io";
  }
  if (providerLower.includes("fal")) {
    return "https://fal.ai";
  }
  if (providerLower.includes("replicate")) {
    return "https://replicate.com";
  }
  if (providerLower.includes("moonshot") || providerLower.includes("kimi")) {
    return "https://platform.moonshot.ai";
  }
  if (providerLower.includes("minimax")) {
    return "https://platform.minimax.io";
  }
  if (providerLower === "gmi") {
    return "https://www.gmicloud.ai";
  }
  if (providerLower === "meta") {
    return "https://dev.meta.ai";
  }
  if (providerLower === "alibaba") {
    return "https://modelstudio.console.alibabacloud.com/";
  }
  if (providerLower === "cohere") {
    return "https://cohere.com";
  }
  if (
    providerLower === "voyage" ||
    providerLower === "voyage-ai" ||
    providerLower === "voyageai"
  ) {
    return "https://www.voyageai.com";
  }
  if (
    providerLower === "jina" ||
    providerLower === "jina-ai" ||
    providerLower === "jinaai"
  ) {
    return "https://jina.ai";
  }
  if (
    providerLower === "zai" ||
    providerLower === "zai-org" ||
    providerLower === "zai_org" ||
    providerLower === "z.ai"
  ) {
    return "https://z.ai";
  }
  // Unknown
  return null;
};

export const getModelUrl = (
  provider?: string,
  modelId?: string,
  modelType?: string
): string | null => {
  if (!modelId) {
    return null;
  }
  let p = (provider || "").toLowerCase();

  // Use modelType to help infer provider if needed
  if (modelType === "llama_model") {
    p = "ollama";
  }

  // Inference logic if provider is unknown
  if (!p) {
    // Heuristic: Ollama models typically have ':' (e.g. gemma:2b), HF models have '/' (user/repo)
    if (modelId.includes(":") && !modelId.includes("/")) {
      p = "ollama";
    } else {
      // Default to Hugging Face for everything else
      p = "huggingface";
    }
  }

  if (isHuggingFaceProvider(p) || p.includes("hf_")) {
    return `https://huggingface.co/${modelId}`;
  }

  if (p.includes("ollama")) {
    // Strip tags like :latest if present, but Ollama URLs often handle them.
    // Commonly ollama models are at https://ollama.com/library/<modelname>
    // Ensure clean model name
    const clean = modelId.split(":")[0];
    return `https://ollama.com/library/${clean}`;
  }

  if (p.includes("openai")) {
    return "https://platform.openai.com/docs/models";
  }

  if (p.includes("anthropic")) {
    return "https://docs.anthropic.com/claude/docs/models-overview";
  }

  if (p.includes("gemini") || p.includes("google")) {
    return "https://ai.google.dev/models";
  }

  if (p.includes("mistral")) {
    return "https://docs.mistral.ai/getting-started/models/";
  }

  return null;
};
