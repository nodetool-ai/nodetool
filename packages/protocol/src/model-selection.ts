/**
 * Whether a model reference names a model the user actually picked.
 *
 * Every model field starts out as a placeholder whose provider is `"empty"` —
 * the repo-wide sentinel for "nothing chosen yet". A selection counts only
 * when both a provider and a model id are present and the provider is not that
 * sentinel, so a placeholder never reaches provider resolution.
 */

import { isNonEmptyString } from "./predicates.js";

export const UNSET_PROVIDER = "empty";

export interface ModelSelection {
  provider?: string | null;
  id?: string | null;
}

export function isModelSelection(provider: unknown, id: unknown): boolean {
  return (
    isNonEmptyString(provider) &&
    provider !== UNSET_PROVIDER &&
    isNonEmptyString(id) &&
    // A client that stringified an absent id sends the literal "undefined".
    id !== "undefined"
  );
}

export function isModelSelected(
  model: ModelSelection | null | undefined
): boolean {
  return isModelSelection(model?.provider, model?.id);
}

/** Guidance for a chat turn submitted with no language model selected. */
export const NO_MODEL_SELECTED_MESSAGE =
  "No model selected. Pick a language model in the composer's model menu, " +
  "or add a provider API key under Settings → Models & Providers.";

/** Guidance for a media generation submitted with no model selected. */
export const noMediaModelSelectedMessage = (mode: string): string =>
  `No ${mode.replace(/_/g, " ")} model selected. Pick one in the composer's ` +
  "model menu, or add a provider API key under Settings → Models & Providers.";
