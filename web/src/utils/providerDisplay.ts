export const isHuggingFaceProvider = (provider?: string): boolean => {
  if (!provider) return false;
  return (
    /^huggingface(\/|_|-|\s|$)/i.test(provider) ||
    /^HuggingFace[A-Z]/.test(provider)
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
  if (!provider) return "";
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
  if (!provider) return "";
  // Normalize common aliases for display
  const p = provider.toLowerCase();
  if (p === "google") return "Gemini";
  const withSpaces = insertSpacesBeforeCapitals(
    provider.replace(/_/g, " ").replace(/-/g, " ")
  );
  return toTitleCase(withSpaces.trim());
};

/** Returns an external URL for a given provider name when known; otherwise null. */
export const getProviderUrl = (provider?: string): string | null => {
  if (!provider) return null;
  const p = provider.toLowerCase();
  if (isHuggingFaceProvider(provider)) return "https://huggingface.co";
  if (p.includes("ollama")) return "https://ollama.com";
  if (p.includes("lmstudio")) return "https://lmstudio.ai";
  if (p.includes("openai")) return "https://platform.openai.com";
  if (p.includes("anthropic")) return "https://console.anthropic.com";
  if (p.includes("gemini") || p.includes("google"))
    return "https://ai.google.dev";
  if (p.includes("replicate")) return "https://replicate.com";
  // Unknown
  return null;
};
