/**
 * Display metadata for the runtime providers that appear in model provider
 * tables. Keyed by the runtime provider id used in `modelProviderCoverage`.
 * `byokEnv` is the API-key env var NodeTool reads for BYOK.
 */
export interface ProviderDisplay {
  name: string;
  byokEnv: string;
  url: string;
}

export const PROVIDER_DISPLAY: Record<string, ProviderDisplay> = {
  fal_ai: { name: "fal.ai", byokEnv: "FAL_API_KEY", url: "https://fal.ai" },
  replicate: {
    name: "Replicate",
    byokEnv: "REPLICATE_API_TOKEN",
    url: "https://replicate.com",
  },
  kie: { name: "Kie", byokEnv: "KIE_API_KEY", url: "https://kie.ai" },
  together: {
    name: "Together AI",
    byokEnv: "TOGETHER_API_KEY",
    url: "https://together.ai",
  },
  atlascloud: {
    name: "AtlasCloud",
    byokEnv: "ATLASCLOUD_API_KEY",
    url: "https://atlascloud.ai",
  },
  topaz: {
    name: "Topaz",
    byokEnv: "TOPAZ_API_KEY",
    url: "https://topazlabs.com",
  },
};

export function providerDisplay(id: string): ProviderDisplay {
  return PROVIDER_DISPLAY[id] ?? { name: id, byokEnv: "", url: "#" };
}
