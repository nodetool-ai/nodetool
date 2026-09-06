/**
 * Whether the curated look choices can actually be rendered right now.
 *
 * PRD § 8.3 pins the tiles to the curated Studio clip models and voices, so
 * this does not replace that list with a provider browser. It asks the
 * narrower question the flow owes the creator before a paid button: does a
 * configured provider report the model behind the tile? The four answers a
 * step has to be able to tell apart are loading, failed, no provider at all,
 * and a provider that offers nothing compatible (F14).
 */

import { useMemo } from "react";

import {
  useTTSModelsByProvider,
  useVideoModelsByProvider
} from "../../../hooks/useModelsByProvider";

export interface CuratedAvailability {
  /** The provider's model list has not answered yet. */
  loading: boolean;
  /** Why the list could not be read, in the creator's words. */
  error: string | null;
  refetch: () => void;
  /**
   * The ids a configured provider reports, or null while that is unknown —
   * loading, or a failed query. Null means "do not judge a tile by this".
   */
  ids: ReadonlySet<string> | null;
  /** No configured provider offers this kind of model at all. */
  noProvider: boolean;
}

/** Whether a tile can be picked: unknown availability never disables one. */
export const isAvailable = (
  availability: CuratedAvailability,
  id: string
): boolean => availability.ids === null || availability.ids.has(id);

/** The clip models a configured provider reports for `text_to_video`. */
export function useClipModelAvailability(): CuratedAvailability {
  const { models, providers, isLoading, error, refetch } =
    useVideoModelsByProvider({ task: "text_to_video" });

  const ids = useMemo(
    () =>
      isLoading || error ? null : new Set(models.map((model) => model.id)),
    [error, isLoading, models]
  );

  return {
    loading: isLoading,
    error: error ? error.message : null,
    refetch: () => void refetch(),
    ids,
    noProvider: !isLoading && !error && providers.length === 0
  };
}

/**
 * The voices a configured provider reports. A curated voice is one model plus
 * one voice, so a voice counts as available when its model is reported and
 * names it.
 */
export function useVoiceAvailability(): CuratedAvailability {
  const { models, providers, isLoading, error, refetch } =
    useTTSModelsByProvider();

  const ids = useMemo(() => {
    if (isLoading || error) {
      return null;
    }
    const voices = new Set<string>();
    for (const model of models) {
      for (const voice of model.voices ?? []) {
        voices.add(voice);
      }
    }
    return voices;
  }, [error, isLoading, models]);

  return {
    loading: isLoading,
    error: error ? error.message : null,
    refetch: () => void refetch(),
    ids,
    noProvider: !isLoading && !error && providers.length === 0
  };
}
