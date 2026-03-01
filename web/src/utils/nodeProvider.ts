export type ProviderKind = "api" | "local";

const namespaceToSecretKey: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  mistral: "MISTRAL_API_KEY",
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
  apify: "APIFY_API_KEY",
  replicate: "REPLICATE_API_TOKEN",
  calendly: "CALENDLY_API_TOKEN",
  kie: "KIE_API_KEY",
  fal: "FAL_API_KEY"
};

// API-backed namespaces that currently do not require a dedicated key in this map.
const apiNamespacesWithoutSecret = new Set<string>(["messaging"]);

const secretKeyToDisplayName: Record<string, string> = {
  OPENAI_API_KEY: "OpenAI API Key",
  ANTHROPIC_API_KEY: "Anthropic API Key",
  MISTRAL_API_KEY: "Mistral API Key",
  GEMINI_API_KEY: "Gemini API Key",
  MESHY_API_KEY: "Meshy API Key",
  RODIN_API_KEY: "Rodin API Key",
  TRELLIS_API_KEY: "Trellis API Key",
  TRIPO_API_KEY: "Tripo API Key",
  HUNYUAN3D_API_KEY: "Hunyuan3D API Key",
  SHAP_E_API_KEY: "Shap-E API Key",
  POINT_E_API_KEY: "Point-E API Key",
  AIME_API_KEY: "Aime API Key",
  APIFY_API_KEY: "Apify API Key",
  REPLICATE_API_TOKEN: "Replicate API Token",
  CALENDLY_API_TOKEN: "Calendly API Token",
  HF_TOKEN: "HuggingFace Token",
  KIE_API_KEY: "Kie API Key",
  FAL_API_KEY: "FAL API Key"
};

export const getRootNamespace = (namespace: string): string =>
  namespace.split(".")[0].toLowerCase();

export const getRequiredSecretKeyForNamespace = (
  namespace: string
): string | null => {
  const root = getRootNamespace(namespace);
  return namespaceToSecretKey[root] || null;
};

export const getSecretDisplayName = (secretKey: string): string =>
  secretKeyToDisplayName[secretKey] || secretKey;

export const getProviderKindForNamespace = (namespace: string): ProviderKind =>
  getRequiredSecretKeyForNamespace(namespace) ||
  apiNamespacesWithoutSecret.has(getRootNamespace(namespace))
    ? "api"
    : "local";

export const isApiNamespace = (namespace: string): boolean =>
  getProviderKindForNamespace(namespace) === "api";
