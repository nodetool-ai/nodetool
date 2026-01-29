import { useMemo } from "react";
import { useSecrets } from "./useSecrets";

/**
 * Maps namespace root to required API key secret name
 */
const getRequiredSecretKey = (namespace: string): string | null => {
  const rootNamespace = namespace.split(".")[0].toLowerCase();
  
  const namespaceToSecretKey: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GEMINI_API_KEY",
    gemini: "GEMINI_API_KEY",
    meshy: "MESHY_API_KEY",
    rodin: "RODIN_API_KEY",
    trellis: "TRELLIS_API_KEY",
    tripo: "TRIPO_API_KEY",
    hunyuan3d: "HUNYUAN3D_API_KEY",
    shap_e: "SHAP_E_API_KEY",
    point_e: "POINT_E_API_KEY",
    "shap-e": "SHAP_E_API_KEY",
    "point-e": "POINT_E_API_KEY",
    aime: "AIME_API_KEY",
    replicate: "REPLICATE_API_TOKEN",
    calendly: "CALENDLY_API_TOKEN",
    huggingface: "HF_TOKEN",
    fal: "FAL_API_KEY"
  };

  return namespaceToSecretKey[rootNamespace] || null;
};

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

/**
 * Hook to validate if required API key exists for a node namespace
 * @param nodeNamespace - The namespace of the node (e.g., "openai.chat", "anthropic.complete")
 * @returns The missing API key display name if not found, or null if found
 */
export const useApiKeyValidation = (nodeNamespace: string): string | null => {
  const { isApiKeySet, isLoading } = useSecrets();

  return useMemo(() => {
    if (isLoading) {
      return null; // Don't show validation while loading
    }

    const requiredSecretKey = getRequiredSecretKey(nodeNamespace);
    
    if (!requiredSecretKey) {
      return null; // No API key required for this namespace
    }

    const isSet = isApiKeySet(requiredSecretKey);
    
    if (!isSet) {
      return getSecretDisplayName(requiredSecretKey);
    }

    return null; // API key is set
  }, [nodeNamespace, isApiKeySet, isLoading]);
};
