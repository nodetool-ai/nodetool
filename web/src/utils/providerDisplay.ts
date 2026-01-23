export const isHuggingFaceProvider = (provider?: string): boolean => {
  if (!provider) {return false;}
  return (
    /^huggingface(\/|_|-|\s|$)/i.test(provider) ||
    /^HuggingFace[A-Z]/.test(provider)
  );
};

/**
 * Checks if a HuggingFace provider is local (runs models locally).
 * The provider "huggingface" (without sub-org) is the local provider.
 */
export const isHuggingFaceLocalProvider = (provider?: string): boolean => {
  if (!provider) {return false;}
  const normalized = provider.toLowerCase().trim();
  // "huggingface" without any sub-org suffix is local
  return normalized === "huggingface";
};

export const isLocalProvider = (provider?: string): boolean => {
  if (!provider) {return false;}
  const providerLower = provider.toLowerCase().trim();
  return (
    providerLower === "huggingface" ||
    providerLower.includes("ollama") ||
    providerLower.includes("llama_cpp") ||
    providerLower.includes("llama-cpp") ||
    providerLower.includes("llamacpp") ||
    providerLower === "mlx"
  );
};

export const isCloudProvider = (provider?: string): boolean => {
  if (!provider) {return false;}
  // If it's not local, we assume it's an API/Cloud provider
  return !isLocalProvider(provider);
};

export const isHuggingFaceInferenceProvider = (provider?: string): boolean => {
  if (!provider) {return false;}
  const providerLower = provider.toLowerCase().trim();
  return providerLower.includes("hf_inference") || providerLower.includes("huggingface_inference");
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
  if (!provider) {return "";}
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

// Fallback formatter for arbitrary provider strings
export const formatGenericProviderName = (provider?: string): string => {
  if (!provider) {return "";}
  // Normalize common aliases for display
  const providerLower = provider.toLowerCase();
  if (providerLower === "llama_cpp" || providerLower === "llama-cpp" || providerLower === "llamacpp")
    {return "Llama.cpp";}
  if (providerLower === "google") {return "Gemini";}
  if (providerLower === "fal_ai" || providerLower === "fal-ai" || providerLower === "falai") {return "FAL AI";}
  if (providerLower === "zai-org" || providerLower === "zai_org" || providerLower === "zai") {return "Z.AI";}
  const withSpaces = insertSpacesBeforeCapitals(
    provider.replace(/_/g, " ").replace(/-/g, " ")
  );
  return toTitleCase(withSpaces.trim());
};

// Returns the Hugging Face org slug derived from a provider string
// e.g. "huggingface/fireworks-ai" -> "fireworks-ai"
//      "huggingface_cerebras" -> "cerebras"
//      "HuggingFaceBlackForestLabs" -> "blackforestlabs" (best effort)
const getHuggingFaceSlug = (provider?: string): string | null => {
  if (!provider) {return null;}
  let remainder = provider;
  remainder = remainder.replace(/^huggingface[\s/_-]?/i, "");
  remainder = remainder.replace(/^HuggingFace/, "");
  if (remainder.includes("/")) {
    const parts = remainder.split("/").filter(Boolean);
    remainder = parts[parts.length - 1] ?? remainder;
  }
  remainder = remainder.trim();
  if (!remainder) {return null;}
  // Normalize to URL-friendly slug
  let slug = remainder.replace(/\s+/g, "-").replace(/_/g, "-").toLowerCase();
  // Known HF org aliases
  const HF_ORG_ALIAS: Record<string, string> = {
    together: "togethercomputer",
    sambanova: "sambanovasystems"
  };
  if (HF_ORG_ALIAS[slug]) {slug = HF_ORG_ALIAS[slug];}
  return slug || null;
};

/** Returns an external URL for a given provider name when known; otherwise null. */
export const getProviderUrl = (provider?: string): string | null => {
  if (!provider) {return null;}
  const providerLower = provider.toLowerCase();
  if (isHuggingFaceProvider(provider)) {
    const slug = getHuggingFaceSlug(provider);
    return slug ? `https://huggingface.co/${slug}` : "https://huggingface.co";
  }
  if (
    providerLower.includes("llama_cpp") ||
    providerLower.includes("llama-cpp") ||
    providerLower.includes("llamacpp")
  )
    {return "https://github.com/ggerganov/llama.cpp";}
  if (providerLower.includes("ollama")) {return "https://ollama.com";}
  if (providerLower.includes("lmstudio")) {return "https://lmstudio.ai";}
  if (providerLower.includes("openai")) {return "https://platform.openai.com";}
  if (providerLower.includes("anthropic")) {return "https://console.anthropic.com";}
  if (providerLower.includes("gemini") || providerLower.includes("google"))
    {return "https://ai.google.dev";}
  if (providerLower.includes("fal")) {return "https://fal.ai";}
  if (providerLower.includes("replicate")) {return "https://replicate.com";}
  if (providerLower.includes("aime")) {return "https://www.aime.info/en/";}
  if (providerLower === "zai" || providerLower === "zai-org" || providerLower === "zai_org" || providerLower === "z.ai")
    {return "https://z.ai";}
  // Unknown
  return null;
};

export const getModelUrl = (
  provider?: string,
  modelId?: string,
  modelType?: string
): string | null => {
  if (!modelId) {return null;}
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

  if (p === "huggingface" || p.includes("hf_") || p.includes("huggingface_")) {
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
