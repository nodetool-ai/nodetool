export { paceSpeed } from "@nodetool-ai/protocol";

/** Providers that take `speed` and do nothing with it. */
const PACE_BLIND_PROVIDERS: readonly string[] = [
  "gemini",
  "google",
  "huggingface",
  "hf",
  "nodetool"
];

/** False when this provider reads at its own pace whatever the flow asks for. */
export function providerAppliesPace(provider: string): boolean {
  return !PACE_BLIND_PROVIDERS.includes(provider.toLowerCase());
}
