import { getProviderDisplayName } from "../../../utils/providerDisplay";

/** The model field's warning when its provider has no API key. */
export const missingKeyWarning = (
  provider: string | undefined,
  secret: string
): string =>
  `${getProviderDisplayName(provider)} needs ${secret}. Add it in Settings, or pick another model.`;
