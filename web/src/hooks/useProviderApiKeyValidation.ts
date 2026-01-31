import { useMemo } from "react";
import { useSecrets } from "./useSecrets";
import { requiredSecretForProvider } from "../stores/ModelMenuStore";
import { formatGenericProviderName, isHuggingFaceProvider, getProviderBaseName } from "../utils/providerDisplay";

/**
 * Maps API key secret name to display name
 */
const getSecretDisplayName = (secretKey: string): string => {
  const secretKeyToDisplayName: Record<string, string> = {
    OPENAI_API_KEY: "OpenAI API Key",
    ANTHROPIC_API_KEY: "Anthropic API Key",
    GEMINI_API_KEY: "Gemini API Key",
    MESHY_API_KEY: "Meshy API Key",
    RODIN_API_KEY: "Rodin API Key",
    TRELLIS_API_KEY: "Trellis API Key",
    TRIPO_API_KEY: "Tripo API Key",
    HUNYUAN3D_API_KEY: "Hunyuan3D API Key",
    SHAP_E_API_KEY: "Shap-E API Key",
    POINT_E_API_KEY: "Point-E API Key",
    AIME_API_KEY: "Aime API Key",
    REPLICATE_API_TOKEN: "Replicate API Token",
    CALENDLY_API_TOKEN: "Calendly API Token",
    HF_TOKEN: "HuggingFace Token",
    FAL_API_KEY: "FAL API Key"
  };

  return secretKeyToDisplayName[secretKey] || secretKey;
};

export interface ProviderApiKeyStatus {
  provider: string;
  providerDisplayName: string;
  secretKey: string;
  secretDisplayName: string;
  isMissing: boolean;
}

/**
 * Hook to validate API keys for a list of providers
 * @param providers - Array of provider names (e.g., ["openai", "anthropic", "replicate"])
 * @returns Array of provider API key statuses
 */
export const useProviderApiKeyValidation = (
  providers: string[]
): ProviderApiKeyStatus[] => {
  const { isApiKeySet, isLoading } = useSecrets();

  return useMemo(() => {
    if (isLoading) {
      return []; // Don't show validation while loading
    }

    const statuses: ProviderApiKeyStatus[] = [];

    providers.forEach((provider) => {
      const secretKey = requiredSecretForProvider(provider);
      
      if (!secretKey) {
        // No API key required for this provider
        return;
      }

      const isSet = isApiKeySet(secretKey);
      
      if (!isSet) {
        const providerDisplayName = isHuggingFaceProvider(provider)
          ? getProviderBaseName(provider)
          : formatGenericProviderName(provider);
        
        statuses.push({
          provider,
          providerDisplayName,
          secretKey,
          secretDisplayName: getSecretDisplayName(secretKey),
          isMissing: true
        });
      }
    });

    return statuses;
  }, [providers, isApiKeySet, isLoading]);
};
