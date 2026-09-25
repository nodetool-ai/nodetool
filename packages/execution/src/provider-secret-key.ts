/** Resolve FAL's configured key for both its node and generic provider IDs. */
export function providerBillingSecretKey(provider: string): string {
  return provider === "fal_ai"
    ? "FAL_API_KEY"
    : `${provider.toUpperCase()}_API_KEY`;
}
