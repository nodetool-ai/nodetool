type ProviderKind = "api" | "local";

const namespaceToSecretKey: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  mistral: "MISTRAL_API_KEY",
  google: "GEMINI_API_KEY",
  gemini: "GEMINI_API_KEY",
  vertex: "GOOGLE_CLOUD_PROJECT",
  codex: "CODEX_ACCESS_TOKEN",
  claude_code: "CLAUDE_SUBSCRIPTION",
  meshy: "MESHY_API_KEY",
  rodin: "RODIN_API_KEY",
  trellis: "TRELLIS_API_KEY",
  tripo: "TRIPO_API_KEY",
  hunyuan3d: "HUNYUAN3D_API_KEY",
  shap_e: "SHAP_E_API_KEY",
  point_e: "POINT_E_API_KEY",
  "shap-e": "SHAP_E_API_KEY",
  "point-e": "POINT_E_API_KEY",
  huggingface: "HF_TOKEN",
  apify: "APIFY_API_TOKEN",
  replicate: "REPLICATE_API_TOKEN",
  calendly: "CALENDLY_API_TOKEN",
  kie: "KIE_API_KEY",
  topaz: "TOPAZ_API_KEY",
  reve: "REVE_API_KEY",
  fal: "FAL_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
  search: "SERPAPI_API_KEY",
  atlascloud: "ATLASCLOUD_API_KEY",
  higgsfield: "HIGGSFIELD_API_KEY_ID",
  xai: "XAI_API_KEY",
  together: "TOGETHER_API_KEY",
  minimax: "MINIMAX_API_KEY"
};

// API-backed namespaces that currently do not require a dedicated key in this map.
const apiNamespacesWithoutSecret = new Set<string>(["messaging"]);

// Namespaces that run locally but may require a token (e.g. for model download).
// These override the default "has secret key → api" heuristic.
const localNamespaces = new Set<string>(["huggingface"]);

const secretKeyToDisplayName: Record<string, string> = {
  OPENAI_API_KEY: "OpenAI API Key",
  ANTHROPIC_API_KEY: "Anthropic API Key",
  MISTRAL_API_KEY: "Mistral API Key",
  GEMINI_API_KEY: "Gemini API Key",
  GOOGLE_CLOUD_PROJECT: "Google Cloud Project",
  CODEX_ACCESS_TOKEN: "ChatGPT Sign-in",
  CLAUDE_SUBSCRIPTION: "Claude Code Sign-in",
  MESHY_API_KEY: "Meshy API Key",
  RODIN_API_KEY: "Rodin API Key",
  TRELLIS_API_KEY: "Trellis API Key",
  TRIPO_API_KEY: "Tripo API Key",
  HUNYUAN3D_API_KEY: "Hunyuan3D API Key",
  SHAP_E_API_KEY: "Shap-E API Key",
  POINT_E_API_KEY: "Point-E API Key",
  APIFY_API_TOKEN: "Apify API Token",
  REPLICATE_API_TOKEN: "Replicate API Token",
  CALENDLY_API_TOKEN: "Calendly API Token",
  HF_TOKEN: "HuggingFace Token",
  KIE_API_KEY: "Kie API Key",
  TOPAZ_API_KEY: "Topaz API Key",
  REVE_API_KEY: "Reve API Key",
  FAL_API_KEY: "FAL API Key",
  ELEVENLABS_API_KEY: "ElevenLabs API Key",
  // Only lib.comfy.RunWorkflowOnCloud needs this, so `namespaceToSecretKey`
  // stays untouched — the per-node `required_settings` metadata drives it.
  COMFY_API_KEY: "Comfy Cloud",
  SERPAPI_API_KEY: "SerpAPI Key",
  ATLASCLOUD_API_KEY: "AtlasCloud API Key",
  HIGGSFIELD_API_KEY_ID: "Higgsfield API Key ID",
  HIGGSFIELD_API_KEY_SECRET: "Higgsfield API Key Secret",
  XAI_API_KEY: "xAI API Key",
  TOGETHER_API_KEY: "Together API Key",
  MINIMAX_API_KEY: "MiniMax API Key"
};

/**
 * Gates that are not a stored secret. A sign-in (Codex, Claude Code) or
 * machine credentials (Vertex AI through `gcloud`) leave nothing in the
 * secrets list, so these count as set when the server offers their provider.
 */
const gateKeyToProviderId: Record<string, string> = {
  GOOGLE_CLOUD_PROJECT: "gemini_vertex",
  CODEX_ACCESS_TOKEN: "codex",
  CLAUDE_SUBSCRIPTION: "claude_agent_sdk"
};

/** The registry provider whose availability satisfies a gate key, if any. */
export const getProviderIdForGateKey = (key: string): string | null =>
  gateKeyToProviderId[key] ?? null;

/**
 * The settings card that sets up a gate key. The ChatGPT sign-in lives on the
 * OpenAI card.
 */
export const getSettingsKeyForGateKey = (key: string): string =>
  key === "CODEX_ACCESS_TOKEN" ? "OPENAI_API_KEY" : key;

/**
 * Names the node library uses for a provider namespace when the secret's
 * name does not fit: the namespaces that share a vendor with another one.
 */
const providerNames: Record<string, string> = {
  vertex: "Vertex AI",
  codex: "Codex",
  claude_code: "Claude Code"
};

/** The display name of a root namespace that has one, e.g. "Vertex AI". */
export const getNamespaceDisplayName = (namespace: string): string | null =>
  providerNames[namespace] ?? null;

const getRootNamespace = (namespace: string): string =>
  namespace.split(".")[0].toLowerCase();

export const getRequiredSecretKeyForNamespace = (
  namespace: string
): string | null => {
  const root = getRootNamespace(namespace);
  return namespaceToSecretKey[root] || null;
};

export const getSecretDisplayName = (secretKey: string): string =>
  secretKeyToDisplayName[secretKey] || secretKey;

export const getProviderKindForNamespace = (namespace: string): ProviderKind => {
  const root = getRootNamespace(namespace);
  if (localNamespaces.has(root)) return "local";
  return getRequiredSecretKeyForNamespace(namespace) ||
    apiNamespacesWithoutSecret.has(root)
    ? "api"
    : "local";
};

/** The provider id of every node that runs on this machine. */
export const LOCAL_PROVIDER_ID = "local";

/**
 * The provider a node belongs to in the node library's provider filter: the
 * root namespace of an API-backed node ("fal", "kie", "openai"), or
 * `LOCAL_PROVIDER_ID` for a node that runs locally.
 */
export const getNodeProviderId = (namespace: string): string =>
  getProviderKindForNamespace(namespace) === "api"
    ? getRootNamespace(namespace)
    : LOCAL_PROVIDER_ID;

/**
 * The name the provider filter shows for a provider id from
 * `getNodeProviderId`. It reuses the secret's display name without its
 * "API Key" suffix, so "fal" reads "FAL" and "xai" reads "xAI".
 */
export const getNodeProviderName = (providerId: string): string => {
  const name = providerNames[providerId];
  if (name) return name;
  const secretKey = namespaceToSecretKey[providerId];
  const secretName = secretKey ? secretKeyToDisplayName[secretKey] : undefined;
  if (secretName) {
    return secretName.replace(/\s+(API\s+)?(Key|Token)(\s+ID)?$/, "");
  }
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
};
